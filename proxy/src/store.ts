import { DatabaseSync } from 'node:sqlite';
import {
	type CallFilters,
	matchesFilters,
	matchesSearch,
	toSummary,
} from './summary.js';
import type { CallSummary, CapturedRequest } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Set on a call that was still running when LLMSpy last stopped. */
export const INTERRUPTED = 'interrupted: LLMSpy stopped before the call ended';

export interface StoreOptions {
	/** The database file, or `:memory:` (the default) for a store that ends with the process. */
	path?: string;
	/** Calls older than this many days go at `prune()`; 0 keeps them all. */
	retentionDays?: number;
}

/**
 * `LLMSPY_RETENTION_DAYS`: a whole number of days, 0 to keep every call.
 * Unset means 7.
 */
export function parseRetentionDays(value: string | undefined): number {
	if (value === undefined || value === '') return 7;
	if (!/^\d+$/.test(value)) {
		throw new Error(
			`LLMSPY_RETENTION_DAYS must be a whole number of days (0 keeps every call), not "${value}".`,
		);
	}
	return Number(value);
}

/** Which calls to list. Every field is optional; together they all apply. */
export interface CallQuery extends CallFilters {
	/** Only this project's calls. */
	project?: string;
	/** Only the calls `matchesSearch` keeps for this text. */
	search?: string;
	/** Only the calls that started at or after this time (epoch ms). */
	since?: number;
	/** At most this many: the newest. */
	limit?: number;
}

interface Row {
	id: string;
	summary: string;
	record: string | null;
}

/**
 * Captured calls in SQLite, newest first. A running call is also kept in
 * memory: it changes every half second while its reply streams, but it is
 * written only when it starts, when its response headers arrive and when it
 * ends.
 */
export class RequestStore {
	private readonly db: DatabaseSync;
	private readonly retentionDays: number;
	/** Running calls by id, and whether the stored copy has the response. */
	private readonly running = new Map<
		string,
		{ captured: CapturedRequest; storedResponse: boolean }
	>();

	constructor({ path = ':memory:', retentionDays = 7 }: StoreOptions = {}) {
		this.retentionDays = retentionDays;
		this.db = new DatabaseSync(path);
		// auto_vacuum only takes effect if set before the table is made.
		// secure_delete overwrites what a delete frees, so cleared prompts
		// don't stay in the file.
		this.db.exec(`
			PRAGMA auto_vacuum = INCREMENTAL;
			PRAGMA journal_mode = WAL;
			PRAGMA synchronous = NORMAL;
			PRAGMA secure_delete = ON;
			CREATE TABLE IF NOT EXISTS calls (
				id TEXT PRIMARY KEY,
				start INTEGER NOT NULL,
				project TEXT NOT NULL,
				ended INTEGER NOT NULL,
				summary TEXT NOT NULL,
				record TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS calls_project_start ON calls (project, start);
		`);
		this.markInterrupted();
	}

	/**
	 * Adds a call, or replaces the one with the same id: a call is handed over
	 * while it runs and again when it ends.
	 */
	public addRequest(captured: CapturedRequest): void {
		const ended = captured.timings.end !== undefined;
		const known = this.running.get(captured.id);
		const store =
			ended ||
			!known ||
			(captured.response !== undefined && !known.storedResponse);
		if (store) this.write(captured);
		if (ended) {
			this.running.delete(captured.id);
		} else {
			this.running.set(captured.id, {
				captured,
				storedResponse:
					captured.response !== undefined ||
					(known?.storedResponse ?? false),
			});
		}
	}

	/** Summaries, newest first, of the calls `query` keeps. */
	public summaries({
		project,
		search = '',
		since,
		limit,
		...filters
	}: CallQuery = {}): CallSummary[] {
		const pattern = likePattern(search);
		// A running call's stored copy is behind, so it is checked in memory.
		const rows = this.db
			.prepare(
				`SELECT id, summary, CASE WHEN :search = '' THEN NULL ELSE record END AS record
				FROM calls
				WHERE (:project IS NULL OR project = :project)
					AND (:since IS NULL OR start >= :since)
					AND (:pattern IS NULL OR record LIKE :pattern ESCAPE '\\'
						OR id IN (SELECT value FROM json_each(:running)))
				ORDER BY start DESC, rowid DESC`,
			)
			.all({
				search,
				project: project ?? null,
				since: since ?? null,
				pattern,
				running: JSON.stringify([...this.running.keys()]),
			}) as unknown as Row[];

		const summaries: CallSummary[] = [];
		for (const row of rows) {
			// Search and filters apply after the query, so the limit is counted here.
			if (summaries.length === limit) break;
			const live = this.running.get(row.id)?.captured;
			if (search) {
				const captured =
					live ?? (JSON.parse(row.record ?? '') as CapturedRequest);
				if (!matchesSearch(captured, search)) continue;
			}
			const summary = live
				? toSummary(live)
				: (JSON.parse(row.summary) as CallSummary);
			if (matchesFilters(summary, filters)) summaries.push(summary);
		}
		return summaries;
	}

	/** The calls `query` keeps (every call by default) in full, newest first. */
	public getRequests(query?: CallQuery): CapturedRequest[] {
		return this.summaries(query).map(
			({ id }) => this.get(id) as CapturedRequest,
		);
	}

	public get(id: string): CapturedRequest | undefined {
		const live = this.running.get(id);
		if (live) return live.captured;
		const row = this.db
			.prepare('SELECT record FROM calls WHERE id = ?')
			.get(id) as { record: string } | undefined;
		return row && (JSON.parse(row.record) as CapturedRequest);
	}

	/** Removes the call with this id, and says whether there was one. */
	public remove(id: string): boolean {
		this.running.delete(id);
		const { changes } = this.db
			.prepare('DELETE FROM calls WHERE id = ?')
			.run(id);
		this.vacuum();
		return changes > 0;
	}

	/** Removes every call of `project`, or every call when it is undefined. */
	public clear(project?: string): void {
		for (const [id, { captured }] of this.running) {
			if (project === undefined || captured.project === project) {
				this.running.delete(id);
			}
		}
		this.db
			.prepare(
				'DELETE FROM calls WHERE :project IS NULL OR project = :project',
			)
			.run({ project: project ?? null });
		this.vacuum();
	}

	/** Removes ended calls that started more than `retentionDays` before `now`. */
	public prune(now = Date.now()): void {
		if (this.retentionDays === 0) return;
		const { changes } = this.db
			.prepare('DELETE FROM calls WHERE ended = 1 AND start < ?')
			.run(now - this.retentionDays * DAY_MS);
		if (changes > 0) this.vacuum();
	}

	public close(): void {
		this.db.close();
	}

	private write(captured: CapturedRequest): void {
		this.db
			.prepare(
				`INSERT INTO calls (id, start, project, ended, summary, record)
				VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT (id) DO UPDATE SET
					ended = excluded.ended, summary = excluded.summary, record = excluded.record`,
			)
			.run(
				captured.id,
				captured.timings.start,
				captured.project,
				captured.timings.end === undefined ? 0 : 1,
				JSON.stringify(toSummary(captured)),
				JSON.stringify(captured),
			);
	}

	/**
	 * Calls left running by a LLMSpy that stopped: nothing will end them, so
	 * they end where their data stops, with an error that says so.
	 */
	private markInterrupted(): void {
		const rows = this.db
			.prepare('SELECT record FROM calls WHERE ended = 0')
			.all() as unknown as { record: string }[];
		for (const row of rows) {
			const captured = JSON.parse(row.record) as CapturedRequest;
			const { start, firstByte, lastData } = captured.timings;
			captured.timings.end = lastData ?? firstByte ?? start;
			captured.error = INTERRUPTED;
			this.write(captured);
		}
	}

	/** Gives the pages a delete freed back to the file system. */
	private vacuum(): void {
		this.db.exec('PRAGMA incremental_vacuum');
	}
}

/**
 * A `LIKE` pattern that finds `search` in a record's JSON, or null for no
 * search. `LIKE` ignores case for ASCII only, so a search with other
 * letters is left to `matchesSearch` alone.
 */
function likePattern(search: string): string | null {
	const ascii = [...search].every((char) => char.charCodeAt(0) < 0x80);
	if (!search || !ascii) return null;
	// The record is JSON, so the text is in it escaped as JSON escapes it.
	const escaped = JSON.stringify(search).slice(1, -1);
	return `%${escaped.replace(/[\\%_]/g, '\\$&')}%`;
}
