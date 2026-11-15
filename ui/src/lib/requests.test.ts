import { describe, expect, it } from 'vitest';
import {
	callState,
	countFailed,
	isShown,
	onlyFailed,
	quietFor,
} from './requests.js';
import type { CapturedRequest } from './types.js';

const base: CapturedRequest = {
	id: 'a',
	timestamp: '2026-01-01T00:00:00.000Z',
	project: 'general',
	provider: 'anthropic',
	host: 'api.anthropic.com',
	method: 'POST',
	path: '/v1/messages',
	headers: {},
	body: '{}',
	timings: { start: 1000 },
};
const response = { status: 200, headers: {}, body: '' };

describe('isShown', () => {
	const failed: CapturedRequest = {
		...base,
		id: 'f',
		error: 'stream broke off',
	};
	const view = { project: 'general' };

	it("shows the project's calls only", () => {
		expect(isShown(base, view)).toBe(true);
		expect(isShown({ ...base, project: 'other' }, view)).toBe(false);
	});

	it('shows only the matches of a search', () => {
		const matches = new Set(['f']);
		expect(isShown(failed, { ...view, matches })).toBe(true);
		expect(isShown(base, { ...view, matches })).toBe(false);
	});
});

describe('onlyFailed and countFailed', () => {
	const calls: CapturedRequest[] = [
		{ ...base, id: 'ok', response },
		{ ...base, id: '500', response: { ...response, status: 500 } },
		{ ...base, id: 'broke', error: 'stream broke off' },
	];

	it('keeps the failed calls, in order', () => {
		expect(onlyFailed(calls).map(({ id }) => id)).toEqual(['500', 'broke']);
	});

	it('counts the failed calls', () => {
		expect(countFailed(calls)).toBe(2);
		expect(countFailed([])).toBe(0);
	});
});

describe('callState', () => {
	it('is waiting until the response headers arrive', () => {
		expect(callState(base)).toBe('waiting');
	});

	it('is replying once they have, until the call ends', () => {
		expect(callState({ ...base, response })).toBe('replying');
	});

	it('is done once the call has ended, with or without a response', () => {
		const end = { start: 1000, end: 2000 };
		expect(callState({ ...base, response, timings: end })).toBe('done');
		expect(callState({ ...base, timings: end, error: 'failed' })).toBe(
			'done',
		);
	});
});

describe('quietFor', () => {
	const streaming = { ...base, response, timings: { start: 0, lastData: 0 } };

	it('is undefined until the stream has been quiet for over 5s', () => {
		expect(quietFor(streaming, 5000)).toBeUndefined();
		expect(quietFor(streaming, 5001)).toBe(5001);
		expect(quietFor(streaming, 12_000)).toBe(12_000);
	});

	it('is undefined once the call has ended', () => {
		const ended = {
			...streaming,
			timings: { start: 0, lastData: 0, end: 1 },
		};
		expect(quietFor(ended, 60_000)).toBeUndefined();
	});

	it('is undefined for a reply not passed on while it arrives', () => {
		expect(quietFor({ ...base, response }, 60_000)).toBeUndefined();
	});
});
