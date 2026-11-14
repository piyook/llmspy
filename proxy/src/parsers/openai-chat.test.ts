import { describe, expect, it } from 'vitest';
import { openaiChat } from './openai-chat.js';

// Synthetic fixtures in the shape of the OpenAI Chat Completions API.

describe('openai chat parseRequest', () => {
	it('moves system and developer messages to system and reads every role', () => {
		const request = openaiChat.parseRequest({
			model: 'gpt-test',
			stream: true,
			messages: [
				{ role: 'system', content: 'You are terse.' },
				{
					role: 'developer',
					content: [{ type: 'text', text: 'Use tools.' }],
				},
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'What is in this picture?' },
						{
							type: 'image_url',
							image_url: { url: 'data:image/png;base64,AAAA' },
						},
						{
							type: 'input_audio',
							input_audio: { data: 'AAAA', format: 'wav' },
						},
					],
				},
				{
					role: 'assistant',
					content: null,
					tool_calls: [
						{
							id: 'call_1',
							type: 'function',
							function: {
								name: 'get_weather',
								arguments: '{"city":"Paris"}',
							},
						},
						{
							id: 'call_2',
							type: 'custom',
							custom: { name: 'run_sql', input: 'SELECT 1' },
						},
					],
				},
				{ role: 'tool', tool_call_id: 'call_1', content: 'Sunny' },
				{ role: 'function', name: 'legacy_fn', content: 'done' },
			],
			tools: [
				{
					type: 'function',
					function: {
						name: 'get_weather',
						description: 'Weather for a city',
					},
				},
				{ type: 'custom', custom: { name: 'run_sql' } },
			],
			functions: [{ name: 'legacy_fn', description: 'Old style' }],
		});

		expect(request).toEqual({
			model: 'gpt-test',
			stream: true,
			system: 'You are terse.\n\nUse tools.',
			tools: [
				{ name: 'get_weather', description: 'Weather for a city' },
				{ name: 'run_sql' },
				{ name: 'legacy_fn', description: 'Old style' },
			],
			messages: [
				{
					role: 'user',
					parts: [
						{ type: 'text', text: 'What is in this picture?' },
						{ type: 'image' },
						{
							type: 'other',
							raw: {
								type: 'input_audio',
								input_audio: { data: 'AAAA', format: 'wav' },
							},
						},
					],
				},
				{
					role: 'assistant',
					parts: [
						{
							type: 'tool_call',
							id: 'call_1',
							name: 'get_weather',
							input: { city: 'Paris' },
						},
						{
							type: 'tool_call',
							id: 'call_2',
							name: 'run_sql',
							input: 'SELECT 1',
						},
					],
				},
				{
					role: 'tool',
					parts: [
						{ type: 'tool_result', id: 'call_1', content: 'Sunny' },
					],
				},
				{
					role: 'tool',
					parts: [
						{
							type: 'tool_result',
							id: 'legacy_fn',
							content: 'done',
						},
					],
				},
			],
		});
	});

	it('keeps tool arguments that are not valid JSON as text', () => {
		const request = openaiChat.parseRequest({
			messages: [
				{
					role: 'assistant',
					tool_calls: [
						{
							id: 'c',
							type: 'function',
							function: { name: 'f', arguments: '{bad' },
						},
					],
				},
			],
		});
		expect(request.messages[0]?.parts).toEqual([
			{ type: 'tool_call', id: 'c', name: 'f', input: '{bad' },
		]);
	});

	it('does not throw on a body of the wrong shape', () => {
		expect(openaiChat.parseRequest(null)).toEqual({
			stream: false,
			messages: [],
		});
	});
});

describe('openai chat parseResponse', () => {
	it('reads the first choice, reasoning, refusal and usage', () => {
		expect(
			openaiChat.parseResponse({
				id: 'chatcmpl-1',
				object: 'chat.completion',
				model: 'gpt-test-2026-01-01',
				choices: [
					{
						index: 0,
						message: {
							role: 'assistant',
							reasoning_content: 'Thinking it over.',
							content: 'Sunny.',
							refusal: null,
						},
						finish_reason: 'stop',
					},
				],
				usage: {
					prompt_tokens: 50,
					completion_tokens: 10,
					prompt_tokens_details: { cached_tokens: 32 },
					completion_tokens_details: { reasoning_tokens: 4 },
				},
			}),
		).toEqual({
			model: 'gpt-test-2026-01-01',
			output: {
				role: 'assistant',
				parts: [
					{ type: 'thinking', text: 'Thinking it over.' },
					{ type: 'text', text: 'Sunny.' },
				],
			},
			stopReason: 'stop',
			usage: { input: 50, output: 10, cacheRead: 32, reasoning: 4 },
		});
	});

	it('reads a refusal as text', () => {
		const response = openaiChat.parseResponse({
			choices: [
				{
					message: { content: null, refusal: 'I cannot help.' },
					finish_reason: 'stop',
				},
			],
		});
		expect(response.output?.parts).toEqual([
			{ type: 'text', text: 'I cannot help.' },
		]);
	});
});

describe('openai chat parseStream', () => {
	const chunk = (delta: object, finish_reason: string | null = null) => ({
		object: 'chat.completion.chunk',
		model: 'gpt-test-2026-01-01',
		choices: [{ index: 0, delta, finish_reason }],
	});

	it('joins text, reasoning and tool call pieces, and reads the usage chunk', () => {
		const response = openaiChat.parseStream([
			chunk({ role: 'assistant', content: '' }),
			chunk({ reasoning: 'Hmm' }),
			chunk({ content: 'Let me ' }),
			chunk({ content: 'check.' }),
			chunk({
				tool_calls: [
					{
						index: 0,
						id: 'call_1',
						type: 'function',
						function: { name: 'get_weather', arguments: '' },
					},
				],
			}),
			chunk({
				tool_calls: [{ index: 0, function: { arguments: '{"city":' } }],
			}),
			chunk({
				tool_calls: [
					{
						index: 1,
						id: 'call_2',
						type: 'function',
						function: { name: 'now', arguments: '{}' },
					},
				],
			}),
			chunk({
				tool_calls: [{ index: 0, function: { arguments: '"Paris"}' } }],
			}),
			chunk({}, 'tool_calls'),
			{
				object: 'chat.completion.chunk',
				model: 'gpt-test-2026-01-01',
				choices: [],
				usage: { prompt_tokens: 7, completion_tokens: 20 },
			},
		]);

		expect(response).toEqual({
			model: 'gpt-test-2026-01-01',
			output: {
				role: 'assistant',
				parts: [
					{ type: 'thinking', text: 'Hmm' },
					{ type: 'text', text: 'Let me check.' },
					{
						type: 'tool_call',
						id: 'call_1',
						name: 'get_weather',
						input: { city: 'Paris' },
					},
					{ type: 'tool_call', id: 'call_2', name: 'now', input: {} },
				],
			},
			stopReason: 'tool_calls',
			usage: { input: 7, output: 20 },
		});
	});

	it('ignores choices other than the first', () => {
		const response = openaiChat.parseStream([
			{
				choices: [
					{ index: 1, delta: { content: 'other' } },
					{ index: 0, delta: { content: 'first' } },
				],
			},
		]);
		expect(response.output?.parts).toEqual([
			{ type: 'text', text: 'first' },
		]);
	});

	it('keeps the reply so far and the error from an error chunk', () => {
		const response = openaiChat.parseStream([
			chunk({ role: 'assistant', content: '' }),
			chunk({ content: 'Lorem ' }),
			{
				error: {
					message: 'The server had an error',
					type: 'server_error',
					param: null,
					code: null,
				},
			},
		]);
		expect(response.output?.parts).toEqual([
			{ type: 'text', text: 'Lorem ' },
		]);
		expect(response.stopReason).toBeUndefined();
		expect(response.error).toEqual({
			type: 'server_error',
			message: 'The server had an error',
		});
	});

	it('sets no error on a stream that finished', () => {
		const response = openaiChat.parseStream([
			chunk({ content: 'Hi' }, 'stop'),
		]);
		expect(response).not.toHaveProperty('error');
	});

	it('returns nothing for an empty stream', () => {
		expect(openaiChat.parseStream([])).toEqual({});
	});
});
