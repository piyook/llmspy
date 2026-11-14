import { describe, expect, it } from 'vitest';
import { anthropicMessages } from './anthropic.js';

// Synthetic fixtures in the shape of the Anthropic Messages API.

describe('anthropic parseRequest', () => {
	it('reads model, system, tools and every kind of block', () => {
		const request = anthropicMessages.parseRequest({
			model: 'claude-test',
			stream: true,
			system: [
				{ type: 'text', text: 'You are terse.' },
				{
					type: 'text',
					text: 'Use tools.',
					cache_control: { type: 'ephemeral' },
				},
			],
			tools: [
				{
					name: 'get_weather',
					description: 'Weather for a city',
					input_schema: {},
				},
				{ type: 'web_search_20250305', name: 'web_search' },
			],
			messages: [
				{ role: 'user', content: 'Weather in Paris?' },
				{
					role: 'assistant',
					content: [
						{
							type: 'thinking',
							thinking: 'Need the tool.',
							signature: 'sig',
						},
						{
							type: 'tool_use',
							id: 'toolu_1',
							name: 'get_weather',
							input: { city: 'Paris' },
						},
					],
				},
				{
					role: 'user',
					content: [
						{
							type: 'tool_result',
							tool_use_id: 'toolu_1',
							is_error: true,
							content: [
								{ type: 'text', text: 'Service down' },
								{ type: 'image', source: {} },
							],
						},
						{
							type: 'image',
							source: { type: 'base64', data: 'AAAA' },
						},
						{
							type: 'document',
							source: { type: 'text', data: 'notes' },
						},
					],
				},
			],
		});

		expect(request).toEqual({
			model: 'claude-test',
			stream: true,
			system: 'You are terse.\n\nUse tools.',
			tools: [
				{ name: 'get_weather', description: 'Weather for a city' },
				{ name: 'web_search' },
			],
			messages: [
				{
					role: 'user',
					parts: [{ type: 'text', text: 'Weather in Paris?' }],
				},
				{
					role: 'assistant',
					parts: [
						{ type: 'thinking', text: 'Need the tool.' },
						{
							type: 'tool_call',
							id: 'toolu_1',
							name: 'get_weather',
							input: { city: 'Paris' },
						},
					],
				},
				{
					role: 'user',
					parts: [
						{
							type: 'tool_result',
							id: 'toolu_1',
							content: 'Service down\n[image]',
							isError: true,
						},
						{ type: 'image' },
						{
							type: 'other',
							raw: {
								type: 'document',
								source: { type: 'text', data: 'notes' },
							},
						},
					],
				},
			],
		});
	});

	it('accepts a string system and no tools', () => {
		const request = anthropicMessages.parseRequest({
			system: 'Be brief.',
			messages: [],
		});
		expect(request.system).toBe('Be brief.');
		expect(request.stream).toBe(false);
		expect(request.tools).toBeUndefined();
	});

	it('does not throw on a body of the wrong shape', () => {
		expect(anthropicMessages.parseRequest('nope')).toEqual({
			stream: false,
			messages: [],
		});
	});
});

describe('anthropic parseResponse', () => {
	it('reads the reply, stop reason and usage', () => {
		expect(
			anthropicMessages.parseResponse({
				id: 'msg_1',
				type: 'message',
				role: 'assistant',
				model: 'claude-test-20260101',
				content: [{ type: 'text', text: 'Sunny.' }],
				stop_reason: 'end_turn',
				usage: {
					input_tokens: 12,
					output_tokens: 3,
					cache_read_input_tokens: 100,
					cache_creation_input_tokens: 0,
				},
			}),
		).toEqual({
			model: 'claude-test-20260101',
			output: {
				role: 'assistant',
				parts: [{ type: 'text', text: 'Sunny.' }],
			},
			stopReason: 'end_turn',
			usage: { input: 12, output: 3, cacheRead: 100, cacheWrite: 0 },
		});
	});
});

describe('anthropic parseStream', () => {
	const start = {
		type: 'message_start',
		message: {
			model: 'claude-test-20260101',
			content: [],
			usage: {
				input_tokens: 20,
				output_tokens: 1,
				cache_read_input_tokens: 5,
			},
		},
	};

	it('reassembles thinking, text and tool input from deltas', () => {
		const response = anthropicMessages.parseStream([
			start,
			{
				type: 'content_block_start',
				index: 0,
				content_block: { type: 'thinking', thinking: '' },
			},
			{
				type: 'content_block_delta',
				index: 0,
				delta: { type: 'thinking_delta', thinking: 'Check ' },
			},
			{
				type: 'content_block_delta',
				index: 0,
				delta: { type: 'thinking_delta', thinking: 'weather.' },
			},
			{
				type: 'content_block_delta',
				index: 0,
				delta: { type: 'signature_delta', signature: 'sig' },
			},
			{ type: 'content_block_stop', index: 0 },
			{ type: 'ping' },
			{
				type: 'content_block_start',
				index: 1,
				content_block: { type: 'text', text: '' },
			},
			{
				type: 'content_block_delta',
				index: 1,
				delta: { type: 'text_delta', text: 'Let me ' },
			},
			{
				type: 'content_block_delta',
				index: 1,
				delta: { type: 'text_delta', text: 'look.' },
			},
			{
				type: 'content_block_start',
				index: 2,
				content_block: {
					type: 'tool_use',
					id: 'toolu_1',
					name: 'get_weather',
					input: {},
				},
			},
			{
				type: 'content_block_delta',
				index: 2,
				delta: { type: 'input_json_delta', partial_json: '{"ci' },
			},
			{
				type: 'content_block_delta',
				index: 2,
				delta: {
					type: 'input_json_delta',
					partial_json: 'ty":"Paris"}',
				},
			},
			{
				type: 'message_delta',
				delta: { stop_reason: 'tool_use' },
				usage: { output_tokens: 42, cache_read_input_tokens: null },
			},
			{ type: 'message_stop' },
		]);

		expect(response).toEqual({
			model: 'claude-test-20260101',
			output: {
				role: 'assistant',
				parts: [
					{ type: 'thinking', text: 'Check weather.' },
					{ type: 'text', text: 'Let me look.' },
					{
						type: 'tool_call',
						id: 'toolu_1',
						name: 'get_weather',
						input: { city: 'Paris' },
					},
				],
			},
			stopReason: 'tool_use',
			usage: { input: 20, output: 42, cacheRead: 5 },
		});
	});

	it('keeps tool input as text when a cut stream left it incomplete', () => {
		const response = anthropicMessages.parseStream([
			start,
			{
				type: 'content_block_start',
				index: 0,
				content_block: {
					type: 'tool_use',
					id: 'toolu_1',
					name: 'get_weather',
					input: {},
				},
			},
			{
				type: 'content_block_delta',
				index: 0,
				delta: {
					type: 'input_json_delta',
					partial_json: '{"city":"Pa',
				},
			},
		]);
		expect(response.output?.parts).toEqual([
			{
				type: 'tool_call',
				id: 'toolu_1',
				name: 'get_weather',
				input: '{"city":"Pa',
			},
		]);
		expect(response.stopReason).toBeUndefined();
	});

	it('keeps the empty input of a tool called without arguments', () => {
		const response = anthropicMessages.parseStream([
			start,
			{
				type: 'content_block_start',
				index: 0,
				content_block: {
					type: 'tool_use',
					id: 'toolu_1',
					name: 'now',
					input: {},
				},
			},
			{
				type: 'content_block_delta',
				index: 0,
				delta: { type: 'input_json_delta', partial_json: '' },
			},
		]);
		expect(response.output?.parts).toEqual([
			{ type: 'tool_call', id: 'toolu_1', name: 'now', input: {} },
		]);
	});

	it('keeps the reply so far and the error when an error event ends the stream', () => {
		const response = anthropicMessages.parseStream([
			start,
			{
				type: 'content_block_start',
				index: 0,
				content_block: { type: 'text', text: '' },
			},
			{
				type: 'content_block_delta',
				index: 0,
				delta: { type: 'text_delta', text: 'Lorem ' },
			},
			{
				type: 'error',
				error: { type: 'overloaded_error', message: 'Overloaded' },
			},
		]);
		expect(response.output?.parts).toEqual([
			{ type: 'text', text: 'Lorem ' },
		]);
		expect(response.stopReason).toBeUndefined();
		expect(response.error).toEqual({
			type: 'overloaded_error',
			message: 'Overloaded',
		});
	});

	it('reads an error sent before the message started', () => {
		const response = anthropicMessages.parseStream([
			{
				type: 'error',
				error: { type: 'api_error', message: 'Internal error' },
			},
		]);
		expect(response).toEqual({
			error: { type: 'api_error', message: 'Internal error' },
		});
	});

	it('sets no error on a stream that finished', () => {
		const response = anthropicMessages.parseStream([
			start,
			{ type: 'message_stop' },
		]);
		expect(response).not.toHaveProperty('error');
	});

	it('returns nothing when the stream never started', () => {
		expect(anthropicMessages.parseStream([])).toEqual({});
	});
});
