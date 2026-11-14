import { describe, expect, it } from 'vitest';
import { openaiResponses } from './openai-responses.js';

// Synthetic fixtures in the shape of the OpenAI Responses API.

describe('openai responses parseRequest', () => {
	it('reads a string input as one user message', () => {
		expect(
			openaiResponses.parseRequest({
				model: 'gpt-test',
				instructions: 'You are terse.',
				input: 'Hi',
			}),
		).toEqual({
			model: 'gpt-test',
			stream: false,
			system: 'You are terse.',
			messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
		});
	});

	it('reads items, grouping one assistant turn into one message', () => {
		const request = openaiResponses.parseRequest({
			model: 'gpt-test',
			stream: true,
			instructions: 'You are terse.',
			input: [
				{ role: 'developer', content: 'Use tools.' },
				{
					type: 'message',
					role: 'user',
					content: [
						{ type: 'input_text', text: 'Weather in Paris?' },
						{
							type: 'input_image',
							image_url: 'data:image/png;base64,AAAA',
						},
						{ type: 'input_file', file_id: 'file_1' },
					],
				},
				{
					type: 'reasoning',
					id: 'rs_1',
					summary: [
						{ type: 'summary_text', text: 'Need the weather.' },
					],
					encrypted_content: 'gAAAA',
				},
				{
					type: 'function_call',
					call_id: 'call_1',
					name: 'get_weather',
					arguments: '{"city":"Paris"}',
				},
				{
					type: 'custom_tool_call',
					call_id: 'call_2',
					name: 'run_sql',
					input: 'SELECT 1',
				},
				{
					type: 'function_call_output',
					call_id: 'call_1',
					output: 'Sunny',
				},
				{
					type: 'custom_tool_call_output',
					call_id: 'call_2',
					output: [{ type: 'input_text', text: '1' }],
				},
				{
					type: 'message',
					role: 'assistant',
					content: [
						{
							type: 'output_text',
							text: 'Sunny.',
							annotations: [],
						},
					],
				},
			],
			tools: [
				{
					type: 'function',
					name: 'get_weather',
					description: 'Weather for a city',
					parameters: {},
				},
				{ type: 'custom', name: 'run_sql' },
				{ type: 'web_search' },
				{ type: 'mcp', server_label: 'docs', server_url: 'https://x' },
			],
		});

		expect(request).toEqual({
			model: 'gpt-test',
			stream: true,
			system: 'You are terse.\n\nUse tools.',
			tools: [
				{ name: 'get_weather', description: 'Weather for a city' },
				{ name: 'run_sql' },
				{ name: 'web_search' },
				{ name: 'docs' },
			],
			messages: [
				{
					role: 'user',
					parts: [
						{ type: 'text', text: 'Weather in Paris?' },
						{ type: 'image' },
						{
							type: 'other',
							raw: { type: 'input_file', file_id: 'file_1' },
						},
					],
				},
				{
					role: 'assistant',
					parts: [
						{ type: 'thinking', text: 'Need the weather.' },
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
						{ type: 'tool_result', id: 'call_2', content: '1' },
					],
				},
				{
					role: 'assistant',
					parts: [{ type: 'text', text: 'Sunny.' }],
				},
			],
		});
	});

	it('does not throw on a body of the wrong shape', () => {
		expect(openaiResponses.parseRequest(null)).toEqual({
			stream: false,
			messages: [],
		});
	});
});

describe('openai responses parseResponse', () => {
	const response = {
		id: 'resp_1',
		object: 'response',
		model: 'gpt-test-2026-01-01',
		status: 'completed',
		incomplete_details: null,
		output: [
			{ type: 'reasoning', id: 'rs_1', summary: [] },
			{
				type: 'message',
				role: 'assistant',
				content: [
					{ type: 'output_text', text: 'Sunny.', annotations: [] },
				],
			},
			{ type: 'web_search_call', id: 'ws_1', status: 'completed' },
		],
		usage: {
			input_tokens: 50,
			input_tokens_details: { cached_tokens: 32 },
			output_tokens: 10,
			output_tokens_details: { reasoning_tokens: 4 },
			total_tokens: 60,
		},
	};

	it('reads the output items, status and usage', () => {
		expect(openaiResponses.parseResponse(response)).toEqual({
			model: 'gpt-test-2026-01-01',
			output: {
				role: 'assistant',
				parts: [
					{ type: 'thinking', text: '' },
					{ type: 'text', text: 'Sunny.' },
					{
						type: 'other',
						raw: {
							type: 'web_search_call',
							id: 'ws_1',
							status: 'completed',
						},
					},
				],
			},
			stopReason: 'completed',
			usage: { input: 50, output: 10, cacheRead: 32, reasoning: 4 },
		});
	});

	it('reads why a response is incomplete as the stop reason', () => {
		const incomplete = openaiResponses.parseResponse({
			status: 'incomplete',
			incomplete_details: { reason: 'max_output_tokens' },
			output: [],
		});
		expect(incomplete.stopReason).toBe('max_output_tokens');
	});

	it('reads the error of a failed response', () => {
		const failed = openaiResponses.parseResponse({
			status: 'failed',
			error: { code: 'server_error', message: 'Something went wrong' },
			output: [],
		});
		expect(failed.stopReason).toBe('failed');
		expect(failed.error).toEqual({
			type: 'server_error',
			message: 'Something went wrong',
		});
	});

	it('sets no error when `error` is null', () => {
		expect(openaiResponses.parseResponse(response)).not.toHaveProperty(
			'error',
		);
	});
});

describe('openai responses parseStream', () => {
	const message = (text: string) => ({
		type: 'message',
		role: 'assistant',
		content: [{ type: 'output_text', text }],
	});

	it('reads the whole response from the closing event', () => {
		const response = openaiResponses.parseStream([
			{
				type: 'response.created',
				response: {
					model: 'gpt-test',
					status: 'in_progress',
					output: [],
				},
			},
			{
				type: 'response.output_text.delta',
				output_index: 0,
				delta: 'Hel',
			},
			{
				type: 'response.completed',
				response: {
					model: 'gpt-test-2026-01-01',
					status: 'completed',
					output: [message('Hello')],
					usage: { input_tokens: 3, output_tokens: 2 },
				},
			},
		]);
		expect(response).toEqual({
			model: 'gpt-test-2026-01-01',
			output: {
				role: 'assistant',
				parts: [{ type: 'text', text: 'Hello' }],
			},
			stopReason: 'completed',
			usage: { input: 3, output: 2 },
		});
	});

	it('rebuilds a stream cut short from items and deltas', () => {
		const response = openaiResponses.parseStream([
			{
				type: 'response.created',
				response: {
					model: 'gpt-test',
					status: 'in_progress',
					output: [],
				},
			},
			{
				type: 'response.output_item.added',
				output_index: 0,
				item: { type: 'reasoning', summary: [] },
			},
			{
				type: 'response.reasoning_summary_text.delta',
				output_index: 0,
				delta: 'Plan',
			},
			{
				type: 'response.output_item.done',
				output_index: 0,
				item: {
					type: 'reasoning',
					summary: [{ type: 'summary_text', text: 'Plan it.' }],
				},
			},
			{
				type: 'response.output_item.added',
				output_index: 1,
				item: { type: 'message', role: 'assistant', content: [] },
			},
			{
				type: 'response.output_text.delta',
				output_index: 1,
				content_index: 0,
				delta: 'Let me ',
			},
			{
				type: 'response.output_text.delta',
				output_index: 1,
				content_index: 0,
				delta: 'check.',
			},
			{
				type: 'response.output_item.added',
				output_index: 2,
				item: {
					type: 'function_call',
					call_id: 'call_1',
					name: 'get_weather',
					arguments: '',
				},
			},
			{
				type: 'response.function_call_arguments.delta',
				output_index: 2,
				delta: '{"city":',
			},
		]);

		expect(response).toEqual({
			model: 'gpt-test',
			output: {
				role: 'assistant',
				parts: [
					{ type: 'thinking', text: 'Plan it.' },
					{ type: 'text', text: 'Let me check.' },
					{
						type: 'tool_call',
						id: 'call_1',
						name: 'get_weather',
						input: '{"city":',
					},
				],
			},
		});
	});

	it('keeps the reply so far and the error from an error event', () => {
		const response = openaiResponses.parseStream([
			{
				type: 'response.output_item.added',
				output_index: 0,
				item: { type: 'message', role: 'assistant', content: [] },
			},
			{
				type: 'response.output_text.delta',
				output_index: 0,
				delta: 'Lorem ',
			},
			{
				type: 'error',
				code: 'server_error',
				message: 'Something went wrong',
				param: null,
			},
		]);
		expect(response.output?.parts).toEqual([
			{ type: 'text', text: 'Lorem ' },
		]);
		expect(response.error).toEqual({
			type: 'server_error',
			message: 'Something went wrong',
		});
	});

	it('reads the error of a response.failed event, else keeps the error event', () => {
		const failed = (error: object | null) =>
			openaiResponses.parseStream([
				{ type: 'error', code: 'early', message: 'From the event' },
				{
					type: 'response.failed',
					response: { status: 'failed', error, output: [] },
				},
			]);
		expect(
			failed({ code: 'server_error', message: 'From the response' })
				.error,
		).toEqual({ type: 'server_error', message: 'From the response' });
		expect(failed(null).error).toEqual({
			type: 'early',
			message: 'From the event',
		});
	});

	it('returns nothing for an empty stream', () => {
		expect(openaiResponses.parseStream([])).toEqual({});
	});
});
