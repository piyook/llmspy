import { describe, expect, it } from 'vitest';
import {
	CAPTURE_FORMAT,
	CAPTURE_VERSION,
	captureFile,
	captureFileName,
	toCaptureCall,
} from './export.js';
import type { CapturedRequest } from './types.js';

const upstreams = new Map([
	['anthropic', new URL('https://api.anthropic.com')],
	['local', new URL('http://127.0.0.1:8001')],
]);

function call(extra: Partial<CapturedRequest> = {}): CapturedRequest {
	return {
		id: 'a',
		timestamp: '2026-01-01T00:00:00.000Z',
		project: 'my-app',
		provider: 'anthropic',
		host: 'api.anthropic.com',
		protocol: 'https:',
		method: 'POST',
		path: '/v1/messages?beta=true',
		headers: {
			'content-type': 'application/json',
			'anthropic-version': '2023-06-01',
			'x-api-key': '••••abcd',
			authorization: 'Bearer ••••abcd',
			cookie: 'session=1',
			'x-goog-api-key': '••••',
			'x-auth-token': 'secret',
			'x-client-secret': 'secret',
			host: '127.0.0.1:8080',
			'content-length': '70',
			'content-encoding': 'gzip',
		},
		body: '{"model":"claude-test"}',
		response: {
			status: 200,
			headers: {
				'content-type': 'application/json',
				'set-cookie': ['a=1'],
				'content-encoding': 'br',
				'content-length': '40',
				'request-id': 'req_1',
			},
			body: '{"content":[]}',
		},
		timings: { start: 1, firstByte: 2, end: 3 },
		latency: 2,
		llm: {
			format: 'anthropic-messages',
			model: 'claude-test',
			stream: false,
			messages: [],
		},
		...extra,
	};
}

describe('toCaptureCall', () => {
	it('keeps the call and its parsed view, and drops credentials and transport headers', () => {
		expect(toCaptureCall(call(), upstreams)).toEqual({
			id: 'a',
			timestamp: '2026-01-01T00:00:00.000Z',
			project: 'my-app',
			upstream: 'anthropic',
			http: {
				request: {
					method: 'POST',
					url: 'https://api.anthropic.com/v1/messages?beta=true',
					headers: {
						'content-type': 'application/json',
						'anthropic-version': '2023-06-01',
					},
					body: '{"model":"claude-test"}',
				},
				response: {
					status: 200,
					headers: {
						'content-type': 'application/json',
						'request-id': 'req_1',
					},
					body: '{"content":[]}',
				},
				timings: { start: 1, firstByte: 2, end: 3 },
			},
			llm: {
				format: 'anthropic-messages',
				model: 'claude-test',
				stream: false,
				messages: [],
			},
		});
	});

	it('leaves out a call that is still running', () => {
		expect(
			toCaptureCall(call({ timings: { start: 1 } }), upstreams),
		).toBeUndefined();
	});

	it('keeps a failed call with no response, and its error', () => {
		const failed = toCaptureCall(
			call({ response: undefined, error: 'ECONNREFUSED' }),
			upstreams,
		);
		expect(failed?.http.response).toBeUndefined();
		expect(failed?.http.error).toBe('ECONNREFUSED');
	});

	it('takes the scheme of an older call from its upstream, else https', () => {
		const old = (provider: string, host: string) =>
			toCaptureCall(
				call({ protocol: undefined, provider, host, path: '/v1/x' }),
				upstreams,
			)?.http.request.url;
		expect(old('local', '127.0.0.1:8001')).toBe(
			'http://127.0.0.1:8001/v1/x',
		);
		// The upstream now points elsewhere, so it says nothing about this call.
		expect(old('local', 'localhost:9000')).toBe(
			'https://localhost:9000/v1/x',
		);
		expect(old('gone', 'example.com')).toBe('https://example.com/v1/x');
	});
});

describe('captureFile', () => {
	const createdAt = new Date('2026-11-22T14:03:11.204Z');
	const file = (calls: CapturedRequest[]) =>
		[
			...captureFile(calls, {
				createdAt,
				createdBy: 'llmspy 9.9.9',
				upstreams,
			}),
		].join('');

	it('writes the header and the finished calls in the order given, as JSON', () => {
		const text = file([
			call({ id: 'first' }),
			call({ id: 'running', timings: { start: 4 } }),
			call({ id: 'second' }),
		]);
		const parsed = JSON.parse(text);
		expect(parsed).toMatchObject({
			format: CAPTURE_FORMAT,
			version: CAPTURE_VERSION,
			createdAt: '2026-11-22T14:03:11.204Z',
			createdBy: 'llmspy 9.9.9',
		});
		expect(parsed.calls.map((c: { id: string }) => c.id)).toEqual([
			'first',
			'second',
		]);
		// Written as one pretty-printed document would be.
		expect(text).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
	});

	it('writes an empty list when nothing matched', () => {
		const text = file([]);
		expect(JSON.parse(text).calls).toEqual([]);
		expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
	});
});

describe('captureFileName', () => {
	it('names the project, or all, and the local time', () => {
		const at = new Date(2026, 10, 2, 9, 5);
		expect(captureFileName('my-app', at)).toBe(
			'llmspy-my-app-20261102-0905.capture.json',
		);
		expect(captureFileName(undefined, at)).toBe(
			'llmspy-all-20261102-0905.capture.json',
		);
	});
});
