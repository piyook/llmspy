import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { INTERRUPTED, parseRetentionDays, RequestStore } from './store.js';
import type { CapturedRequest } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** An ended call; pass `running` for one that has not ended. */
function call(
	id: string,
	{
		path = '/v1/messages',
		project = 'general',
		start = 0,
		body = '',
		running = false,
	} = {},
): CapturedRequest {
	return {
		id,
		timestamp: new Date(start).toISOString(),
		project,
		provider: 'anthropic',
		host: 'api.anthropic.com',
		method: 'POST',
		path,
		headers: {},
		body,
		timings: running ? { start } : { start, end: start + 1 },
	};
}

const ids = (store: RequestStore) => store.summaries().map(({ id }) => id);

const stores: RequestStore[] = [];
const dirs: string[] = [];
afterEach(() => {
	for (const store of stores.splice(0)) store.close();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});

function open(options?: ConstructorParameters<typeof RequestStore>[0]) {
	const store = new RequestStore(options);
	stores.push(store);
	return store;
}

function dbFile(): string {
	const dir = mkdtempSync(path.join(tmpdir(), 'llmspy-store-'));
	dirs.push(dir);
	return path.join(dir, 'llmspy.db');
}

/** The record as written to the file, read past the store's memory. */
function stored(file: string, id: string): CapturedRequest {
	const db = new DatabaseSync(file, { readOnly: true });
	try {
		const row = db.prepare('SELECT record FROM calls WHERE id = ?').get(id);
		return JSON.parse(String(row?.record));
	} finally {
		db.close();
	}
}

describe('RequestStore', () => {
	it('keeps calls newest first', () => {
		const store = open();
		store.addRequest(call('a', { start: 1 }));
		store.addRequest(call('c', { start: 3 }));
		store.addRequest(call('b', { start: 2 }));
		expect(ids(store)).toEqual(['c', 'b', 'a']);
	});

	it('replaces a call with the same id where it is', () => {
		const store = open();
		store.addRequest(call('a'));
		store.addRequest(call('b'));
		store.addRequest(call('a', { path: '/v1/messages?done' }));
		expect(ids(store)).toEqual(['b', 'a']);
		expect(store.get('a')?.path).toBe('/v1/messages?done');
	});

	it('gets one call by id', () => {
		const store = open();
		store.addRequest(call('a'));
		store.addRequest(call('b', { path: '/v1/messages?b' }));
		expect(store.get('b')?.path).toBe('/v1/messages?b');
		expect(store.get('c')).toBeUndefined();
	});

	it('gives every call in full', () => {
		const store = open();
		store.addRequest(call('a', { body: 'first' }));
		store.addRequest(call('b', { body: 'second' }));
		expect(store.getRequests().map(({ body }) => body)).toEqual([
			'second',
			'first',
		]);
	});

	it('removes one call by id, and says whether it was there', () => {
		const store = open();
		store.addRequest(call('a'));
		store.addRequest(call('b'));
		store.addRequest(call('c'));
		expect(store.remove('b')).toBe(true);
		expect(ids(store)).toEqual(['c', 'a']);
		expect(store.remove('b')).toBe(false);
		expect(ids(store)).toEqual(['c', 'a']);
	});

	it('clears one project and keeps the others', () => {
		const store = open();
		store.addRequest(call('a', { project: 'app' }));
		store.addRequest(call('b'));
		store.addRequest(call('c', { project: 'app', running: true }));
		store.clear('app');
		expect(ids(store)).toEqual(['b']);
		store.clear();
		expect(ids(store)).toEqual([]);
	});

	it('adds a call again after it was cleared', () => {
		const store = open();
		store.addRequest(call('a'));
		store.clear();
		store.addRequest(call('a'));
		expect(ids(store)).toEqual(['a']);
	});

	it('lists one project', () => {
		const store = open();
		store.addRequest(call('a', { project: 'app' }));
		store.addRequest(call('b'));
		expect(store.summaries({ project: 'app' }).map(({ id }) => id)).toEqual(
			['a'],
		);
	});

	it('lists the calls that started at or after a time', () => {
		const store = open();
		store.addRequest(call('a', { start: 1 }));
		store.addRequest(call('b', { start: 2 }));
		store.addRequest(call('c', { start: 3, running: true }));
		expect(store.summaries({ since: 2 }).map(({ id }) => id)).toEqual([
			'c',
			'b',
		]);
	});

	it('lists only the newest calls up to a limit', () => {
		const store = open();
		store.addRequest(call('a', { start: 1 }));
		store.addRequest(call('b', { start: 2 }));
		store.addRequest(call('c', { start: 3 }));
		expect(store.summaries({ limit: 2 }).map(({ id }) => id)).toEqual([
			'c',
			'b',
		]);
	});

	it('counts the limit after the search', () => {
		const store = open();
		store.addRequest(call('a', { start: 1, body: 'needle' }));
		store.addRequest(call('b', { start: 2, body: 'needle' }));
		store.addRequest(call('c', { start: 3, body: 'hay' }));
		expect(
			store.summaries({ search: 'needle', limit: 1 }).map(({ id }) => id),
		).toEqual(['b']);
	});

	it('filters before counting the limit, running calls too', () => {
		const store = open();
		const failing = (id: string, start: number, running = false) => ({
			...call(id, { start, running }),
			response: { status: 500, headers: {}, body: '' },
		});
		store.addRequest(failing('a', 1));
		store.addRequest(failing('b', 2));
		store.addRequest(call('c', { start: 3 }));
		store.addRequest(failing('d', 4, true));
		expect(
			store.summaries({ failed: true, limit: 2 }).map(({ id }) => id),
		).toEqual(['d', 'b']);
		expect(store.summaries({ status: '2xx' })).toEqual([]);
	});

	it('gives the calls a query keeps in full', () => {
		const store = open();
		store.addRequest(call('a', { start: 1, body: 'first' }));
		store.addRequest(call('b', { start: 2, body: 'second' }));
		expect(store.getRequests({ since: 2 }).map(({ body }) => body)).toEqual(
			['second'],
		);
	});

	it('lists summaries without the bodies', () => {
		const store = open();
		store.addRequest(call('a', { body: 'big' }));
		expect(store.summaries()[0]).not.toHaveProperty('body');
		expect(store.summaries()[0]).not.toHaveProperty('headers');
	});

	it('keeps calls when LLMSpy restarts', () => {
		const file = dbFile();
		const first = open({ path: file });
		first.addRequest(call('a', { body: 'kept' }));
		first.close();
		stores.splice(stores.indexOf(first), 1);

		const second = open({ path: file });
		expect(ids(second)).toEqual(['a']);
		expect(second.get('a')?.body).toBe('kept');
	});

	describe('a running call', () => {
		it('is written at its start, at its response headers and at its end', () => {
			const file = dbFile();
			const store = open({ path: file });
			const running = call('a', { running: true });
			store.addRequest(running);
			expect(stored(file, 'a').response).toBeUndefined();

			running.response = { status: 200, headers: {}, body: '' };
			store.addRequest(structuredClone(running));
			expect(stored(file, 'a').response?.body).toBe('');

			// The updates while the reply streams stay in memory.
			running.response.body = 'data: half';
			store.addRequest(structuredClone(running));
			expect(stored(file, 'a').response?.body).toBe('');
			expect(store.get('a')?.response?.body).toBe('data: half');

			running.response.body = 'data: all';
			running.timings.end = 5;
			store.addRequest(structuredClone(running));
			expect(stored(file, 'a').response?.body).toBe('data: all');
			expect(stored(file, 'a').timings.end).toBe(5);
		});

		it('is listed as it is in memory', () => {
			const store = open();
			const running = call('a', { running: true });
			store.addRequest(running);
			running.response = { status: 200, headers: {}, body: '' };
			store.addRequest(structuredClone(running));
			running.timings.lastData = 3;
			store.addRequest(structuredClone(running));
			expect(store.summaries()[0].timings.lastData).toBe(3);
		});

		it('is marked interrupted when LLMSpy stopped before it ended', () => {
			const file = dbFile();
			const first = open({ path: file });
			const running = call('a', { start: 10, running: true });
			first.addRequest(running);
			running.response = { status: 200, headers: {}, body: '' };
			running.timings.firstByte = 20;
			first.addRequest(structuredClone(running));
			first.close();
			stores.splice(stores.indexOf(first), 1);

			const second = open({ path: file });
			expect(second.get('a')).toMatchObject({
				error: INTERRUPTED,
				timings: { start: 10, firstByte: 20, end: 20 },
			});
			expect(second.summaries()[0].error).toBe(INTERRUPTED);
		});
	});

	describe('prune', () => {
		const now = 100 * DAY_MS;

		it('removes ended calls older than the retention days', () => {
			const store = open({ retentionDays: 7 });
			store.addRequest(call('old', { start: now - 8 * DAY_MS }));
			store.addRequest(
				call('old-running', { start: now - 8 * DAY_MS, running: true }),
			);
			store.addRequest(call('new', { start: now - 6 * DAY_MS }));
			store.prune(now);
			expect(ids(store)).toEqual(['new', 'old-running']);
		});

		it('keeps every call when the retention is 0 days', () => {
			const store = open({ retentionDays: 0 });
			store.addRequest(call('old', { start: 0 }));
			store.prune(now);
			expect(ids(store)).toEqual(['old']);
		});
	});

	describe('search', () => {
		const found = (store: RequestStore, search: string) =>
			store.summaries({ search }).map(({ id }) => id);

		it('finds the text in a body, ignoring case', () => {
			const store = open();
			store.addRequest(call('a', { body: '{"text":"Hello World"}' }));
			store.addRequest(call('b', { body: '{"text":"goodbye"}' }));
			expect(found(store, 'hello world')).toEqual(['a']);
			expect(found(store, '')).toEqual(['b', 'a']);
		});

		it('takes % _ " and \\ as plain text', () => {
			const store = open();
			store.addRequest(
				call('a', { body: 'a 50% "cut" in C:\\dir_name' }),
			);
			store.addRequest(call('b', { body: 'a 50 cut in Cxdir name' }));
			expect(found(store, '50%')).toEqual(['a']);
			expect(found(store, '"cut"')).toEqual(['a']);
			expect(found(store, 'c:\\dir_')).toEqual(['a']);
		});

		it('ignores case for letters beyond ASCII', () => {
			const store = open();
			store.addRequest(call('a', { body: 'Élan' }));
			expect(found(store, 'éLAN')).toEqual(['a']);
		});

		it('does not match the JSON around the fields it searches', () => {
			const store = open();
			store.addRequest(call('a', { body: 'nothing' }));
			expect(found(store, 'anthropic')).toEqual(['a']);
			expect(found(store, 'POST')).toEqual([]);
		});

		it('searches what a running call holds in memory', () => {
			const store = open();
			const running = call('a', { running: true });
			store.addRequest(running);
			running.response = { status: 200, headers: {}, body: '' };
			store.addRequest(structuredClone(running));
			running.response.body = 'data: needle';
			store.addRequest(structuredClone(running));
			expect(found(store, 'needle')).toEqual(['a']);
		});
	});
});

describe('parseRetentionDays', () => {
	it('is 7 when unset', () => {
		expect(parseRetentionDays(undefined)).toBe(7);
		expect(parseRetentionDays('')).toBe(7);
	});

	it('takes a whole number of days, 0 included', () => {
		expect(parseRetentionDays('30')).toBe(30);
		expect(parseRetentionDays('0')).toBe(0);
	});

	it('refuses anything else', () => {
		for (const value of ['-1', '1.5', 'week', ' 7']) {
			expect(() => parseRetentionDays(value)).toThrow(
				/LLMSPY_RETENTION_DAYS/,
			);
		}
	});
});
