import { describe, expect, it } from 'vitest';
import type { CapturedRequest } from '../types.js';
import { detectFormat, parseExchange } from './index.js';

function capture(overrides: Partial<CapturedRequest>): CapturedRequest {
	return {
		id: 'id',
		timestamp: '2026-01-01T00:00:00.000Z',
		provider: 'anthropic',
		host: 'api.anthropic.com',
		method: 'POST',
		path: '/v1/messages',
		headers: {},
		body: JSON.stringify({
			model: 'claude-test',
			messages: [{ role: 'user', content: 'Hi' }],
		}),
		timings: { start: 0 },
		...overrides,
	};
}

function sse(events: object[]): string {
	return events
		.map(
			(event) =>
				`event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
		)
		.join('');
}

describe('detectFormat', () => {
	it.each([
		['/v1/messages', 'anthropic-messages'],
		['/v1/messages?beta=true', 'anthropic-messages'],
		['/proxy/v1/messages/', 'anthropic-messages'],
		['/v1/chat/completions', 'openai-chat'],
		['/chat/completions', 'openai-chat'],
		['/v1/responses', 'openai-responses'],
	])('reads %s as %s', (path, format) => {
		expect(detectFormat('POST', path)).toBe(format);
	});

	it.each([
		'/v1/messages/count_tokens',
		'/v1/models',
		'/v1/responses/resp_1',
		'/',
	])('ignores %s', (path) => {
		expect(detectFormat('POST', path)).toBeUndefined();
	});

	it('ignores methods other than POST', () => {
		expect(detectFormat('GET', '/v1/messages')).toBeUndefined();
	});
});

describe('parseExchange', () => {
	it('returns nothing for a path that is not an LLM API', () => {
		expect(parseExchange(capture({ path: '/v1/models' }))).toBeUndefined();
	});

	it('combines the request and a JSON response, preferring the answering model', () => {
		const exchange = parseExchange(
			capture({
				response: {
					status: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						model: 'claude-test-20260101',
						content: [{ type: 'text', text: 'Hello' }],
						stop_reason: 'end_turn',
						usage: { input_tokens: 1, output_tokens: 1 },
					}),
				},
			}),
		);
		expect(exchange).toEqual({
			format: 'anthropic-messages',
			model: 'claude-test-20260101',
			stream: false,
			messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
			output: {
				role: 'assistant',
				parts: [{ type: 'text', text: 'Hello' }],
			},
			stopReason: 'end_turn',
			usage: { input: 1, output: 1 },
		});
	});

	it('reassembles a streamed response', () => {
		const exchange = parseExchange(
			capture({
				response: {
					status: 200,
					headers: {
						'content-type': 'text/event-stream; charset=utf-8',
					},
					body: sse([
						{
							type: 'message_start',
							message: { model: 'claude-test', usage: {} },
						},
						{
							type: 'content_block_start',
							index: 0,
							content_block: { type: 'text', text: '' },
						},
						{
							type: 'content_block_delta',
							index: 0,
							delta: { type: 'text_delta', text: 'Hel' },
						},
						{
							type: 'content_block_delta',
							index: 0,
							delta: { type: 'text_delta', text: 'lo' },
						},
						{
							type: 'message_delta',
							delta: { stop_reason: 'end_turn' },
							usage: { output_tokens: 2 },
						},
						{ type: 'message_stop' },
					]),
				},
			}),
		);
		expect(exchange?.stream).toBe(true);
		expect(exchange?.output).toEqual({
			role: 'assistant',
			parts: [{ type: 'text', text: 'Hello' }],
		});
		expect(exchange?.stopReason).toBe('end_turn');
	});

	it('leaves an error response to the raw view', () => {
		const exchange = parseExchange(
			capture({
				response: {
					status: 429,
					headers: { 'content-type': 'application/json' },
					body: '{"type":"error","error":{"type":"rate_limit_error"}}',
				},
			}),
		);
		expect(exchange?.messages).toHaveLength(1);
		expect(exchange?.output).toBeUndefined();
		expect(exchange?.parseError).toBeUndefined();
	});

	it('notes a body that is not JSON and keeps what could be read', () => {
		const exchange = parseExchange(
			capture({
				body: 'not json',
				response: {
					status: 200,
					headers: { 'content-type': 'application/json' },
					body: '{"content":[{"type":"text","text":"Hello"}]}',
				},
			}),
		);
		expect(exchange?.parseError).toMatch(/^request: /);
		expect(exchange?.messages).toEqual([]);
		expect(exchange?.output?.parts).toEqual([
			{ type: 'text', text: 'Hello' },
		]);
	});
});

describe('parseExchange for OpenAI Chat', () => {
	it('reads a stream of unnamed events ending in [DONE]', () => {
		const chunk = (delta: object, finish_reason: string | null = null) =>
			`data: ${JSON.stringify({ model: 'gpt-test', choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
		const exchange = parseExchange(
			capture({
				provider: 'openai',
				path: '/v1/chat/completions',
				body: JSON.stringify({
					model: 'gpt-test',
					stream: true,
					messages: [{ role: 'user', content: 'Hi' }],
				}),
				response: {
					status: 200,
					headers: { 'content-type': 'text/event-stream' },
					body: `${chunk({ content: 'Hel' })}${chunk({ content: 'lo' })}${chunk({}, 'stop')}data: [DONE]\n\n`,
				},
			}),
		);
		expect(exchange).toEqual({
			format: 'openai-chat',
			model: 'gpt-test',
			stream: true,
			messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
			output: {
				role: 'assistant',
				parts: [{ type: 'text', text: 'Hello' }],
			},
			stopReason: 'stop',
		});
	});
});
