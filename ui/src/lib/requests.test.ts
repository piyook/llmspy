import { describe, expect, it } from 'vitest';
import { callState } from './requests.js';
import type { CapturedRequest } from './types.js';

const base: CapturedRequest = {
	id: 'a',
	timestamp: '2026-01-01T00:00:00.000Z',
	provider: 'anthropic',
	host: 'api.anthropic.com',
	method: 'POST',
	path: '/v1/messages',
	headers: {},
	body: '{}',
	timings: { start: 1000 },
};
const response = { status: 200, headers: {}, body: '' };

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
