import { describe, expect, it } from 'vitest';
import { isFailed } from './failed.js';
import { matchesFilters, matchesSearch, toSummary } from './summary.js';
import type { CallSummary, CapturedRequest } from './types.js';

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

describe('isFailed', () => {
	const ok = toSummary(finished);

	it('passes a call that went well, or is still waiting', () => {
		expect(isFailed(ok)).toBe(false);
		expect(isFailed({ ...ok, response: undefined })).toBe(false);
		expect(isFailed({ ...ok, response: { status: 399 } })).toBe(false);
	});

	it.each<[string, Partial<CallSummary>]>([
		['the capture has an error', { error: 'stream broke off' }],
		['the status is 400', { response: { status: 400 } }],
		['the status is 503', { response: { status: 503 } }],
		[
			'the provider sent an error in the reply',
			{
				llm: {
					error: { type: 'overloaded_error', message: 'Overloaded' },
				},
			},
		],
	])('fails a call when %s', (_why, change) => {
		expect(isFailed({ ...ok, ...change })).toBe(true);
	});
});

describe('matchesFilters', () => {
	const ok = toSummary(finished);
	const limited: CallSummary = { ...ok, response: { status: 429 } };

	it('matches everything when no filter is given', () => {
		expect(matchesFilters(ok, {})).toBe(true);
	});

	it('matches part of the model name, ignoring case', () => {
		expect(matchesFilters(ok, { model: 'TEST' })).toBe(true);
		expect(matchesFilters(ok, { model: 'gpt' })).toBe(false);
		expect(
			matchesFilters({ ...ok, llm: undefined }, { model: 'test' }),
		).toBe(false);
	});

	it('matches a status code or a class', () => {
		expect(matchesFilters(limited, { status: '429' })).toBe(true);
		expect(matchesFilters(limited, { status: '4xx' })).toBe(true);
		expect(matchesFilters(limited, { status: '428' })).toBe(false);
		expect(matchesFilters(limited, { status: '5xx' })).toBe(false);
		expect(
			matchesFilters({ ...ok, response: undefined }, { status: '2xx' }),
		).toBe(false);
	});

	it('keeps only failed calls when asked', () => {
		expect(matchesFilters(limited, { failed: true })).toBe(true);
		expect(matchesFilters(ok, { failed: true })).toBe(false);
	});

	it('needs every filter given to match', () => {
		expect(matchesFilters(limited, { model: 'test', status: '429' })).toBe(
			true,
		);
		expect(matchesFilters(limited, { model: 'gpt', status: '429' })).toBe(
			false,
		);
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
