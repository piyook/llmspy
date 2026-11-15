import { describe, expect, it } from 'vitest';
import { matchesSearch, toSummary } from './summary.js';
import type { CapturedRequest } from './types.js';

const finished: CapturedRequest = {
	id: 'a',
	timestamp: '2026-01-01T00:00:00.000Z',
	project: 'my-app',
	provider: 'anthropic',
	host: 'api.anthropic.com',
	method: 'POST',
	path: '/v1/messages',
	headers: { 'x-api-key': '••••abcd' },
	body: '{"model":"claude-test","messages":[{"role":"user","content":"Hello"}]}',
	response: {
		status: 200,
		headers: { 'content-type': 'application/json' },
		body: '{"content":[{"type":"text","text":"Bonjour"}]}',
	},
	timings: { start: 1, firstByte: 2, end: 3 },
	latency: 2,
	llm: {
		format: 'anthropic-messages',
		model: 'claude-test',
		stream: false,
		messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
		output: {
			role: 'assistant',
			parts: [{ type: 'text', text: 'Bonjour' }],
		},
		stopReason: 'end_turn',
		usage: { input: 10, output: 5 },
	},
};

describe('toSummary', () => {
	it('keeps what the list shows and leaves out headers and bodies', () => {
		expect(JSON.parse(JSON.stringify(toSummary(finished)))).toEqual({
			id: 'a',
			timestamp: '2026-01-01T00:00:00.000Z',
			project: 'my-app',
			provider: 'anthropic',
			host: 'api.anthropic.com',
			method: 'POST',
			path: '/v1/messages',
			response: { status: 200 },
			timings: { start: 1, firstByte: 2, end: 3 },
			latency: 2,
			llm: { model: 'claude-test', usage: { input: 10, output: 5 } },
		});
	});

	it('has no response or llm when the record has none, and keeps the error', () => {
		const failed: CapturedRequest = {
			...finished,
			response: undefined,
			llm: undefined,
			latency: undefined,
			error: 'Upstream request failed: ECONNREFUSED',
			timings: { start: 1, end: 3 },
		};
		const summary = toSummary(failed);
		expect(summary.response).toBeUndefined();
		expect(summary.llm).toBeUndefined();
		expect(summary.error).toBe('Upstream request failed: ECONNREFUSED');
	});

	it('keeps an error the provider sent inside the reply', () => {
		const summary = toSummary({
			...finished,
			llm: {
				format: 'anthropic-messages',
				stream: true,
				messages: [],
				error: { type: 'overloaded_error', message: 'Overloaded' },
			},
		});
		expect(summary.llm?.error).toEqual({
			type: 'overloaded_error',
			message: 'Overloaded',
		});
	});
});

describe('matchesSearch', () => {
	it('matches everything when the search is empty', () => {
		expect(matchesSearch(finished, '')).toBe(true);
	});

	it.each([
		['the host', 'ANTHROPIC.com'],
		['the path', 'v1/mess'],
		['the request body', 'hello'],
		['the response body', 'bonjour'],
	])('matches %s, ignoring case', (_where, search) => {
		expect(matchesSearch(finished, search)).toBe(true);
	});

	it('does not match headers or text that is nowhere', () => {
		expect(matchesSearch(finished, 'abcd')).toBe(false);
		expect(matchesSearch(finished, 'nowhere')).toBe(false);
	});

	it('searches a call that has no response yet', () => {
		const waiting = { ...finished, response: undefined };
		expect(matchesSearch(waiting, 'hello')).toBe(true);
		expect(matchesSearch(waiting, 'bonjour')).toBe(false);
	});
});
