import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';

/** Where a running LLMSpy says who it is, for `llmspy stop` (stop.ts). */
export const PID_FILE = path.join(homedir(), '.llmspy', 'llmspy.pid');

interface PidRecord {
	pid: number;
	url: string;
}

/**
 * Records this process and the URL it answers on, and removes the record when
 * the process exits. A failure to write is only a warning: the proxy works
 * without it, `llmspy stop` just can't find it.
 */
export function writePidFile(url: string, file = PID_FILE): void {
	try {
		mkdirSync(path.dirname(file), { recursive: true });
		const record: PidRecord = { pid: process.pid, url };
		writeFileSync(file, JSON.stringify(record));
	} catch (error) {
		console.warn(`Could not write ${file}: ${(error as Error).message}`);
		return;
	}
	process.on('exit', () => removePidFile(file));
}

/**
 * The record in `file`: `'none'` when there is no file, `'invalid'` when it
 * is not a record this module wrote. Any other read error is thrown.
 */
export function readPidFile(file = PID_FILE): PidRecord | 'none' | 'invalid' {
	let text: string;
	try {
		text = readFileSync(file, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'none';
		throw error;
	}
	try {
		const { pid, url } = JSON.parse(text) ?? {};
		return typeof pid === 'number' && typeof url === 'string'
			? { pid, url }
			: 'invalid';
	} catch {
		return 'invalid';
	}
}

/** The pid that LLMSpy at `url` answers `/ping` with, or undefined if nothing does. */
export async function pingPid(url: string): Promise<unknown> {
	try {
		const res = await fetch(`${url}/ping`, {
			signal: AbortSignal.timeout(2000),
		});
		return ((await res.json()) as { pid?: unknown }).pid;
	} catch {
		return undefined;
	}
}

/**
 * What `file` says, checked against `/ping` at its URL: `running` only when
 * LLMSpy there answers with the recorded pid, `stale` when nothing does or
 * another process does. Read errors other than a missing file are thrown.
 */
export async function checkPidFile(
	file = PID_FILE,
): Promise<
	| { kind: 'none' }
	| { kind: 'invalid' }
	| ({ kind: 'running' } & PidRecord)
	| ({ kind: 'stale' } & PidRecord)
> {
	const record = readPidFile(file);
	if (typeof record !== 'object') return { kind: record };
	const answer = await pingPid(record.url);
	return { kind: answer === record.pid ? 'running' : 'stale', ...record };
}

/** Removes the file only if it is still this process's, so a newer LLMSpy's record is left alone. */
export function removePidFile(file = PID_FILE): void {
	try {
		const record = readPidFile(file);
		if (typeof record === 'object' && record.pid === process.pid)
			rmSync(file);
	} catch {
		// Not ours to read or remove.
	}
}
