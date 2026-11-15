import { describe, expect, it } from 'vitest';
import { toMarkdown } from './conversation.js';
import type { LlmExchange } from './parsers/types.js';
import type { CapturedRequest } from './types.js';

const llm: LlmExchange = {
	format: 'anthropic-messages',
	model: 'claude-test',
	stream: true,
	system: 'You are terse.',
	tools: [
		{ name: 'get_weather', description: 'Weather for a city' },
		{ name: 'noop' },
	],
	messages: [
		{ role: 'user', parts: [{ type: 'text', text: 'Weather in Paris?' }] },
		{
			role: 'assistant',
			parts: [
				{ type: 'thinking', text: 'Need the tool.\n\nCall it.' },
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
				{ type: 'tool_result', id: 'toolu_1', content: 'Sunny, 21 C' },
			],
		},
	],
	output: { role: 'assistant', parts: [{ type: 'text', text: 'Sunny.' }] },
	stopReason: 'end_turn',
	usage: { input: 120, output: 8 },
};

const call: CapturedRequest = {
	id: 'a',
	timestamp: '2026-01-01T00:00:00.000Z',
	project: 'my-app',
	provider: 'anthropic',
	host: 'api.anthropic.com',
	method: 'POST',
	path: '/v1/messages',
	headers: {},
	body: '',
	response: { status: 200, headers: {}, body: '' },
	timings: { start: 1, firstByte: 2, end: 1235 },
	latency: 1234,
	llm,
};

describe('toMarkdown', () => {
	it('writes the header, system, tools, messages and reply in order', () => {
		expect(toMarkdown(call)).toBe(
			[
				'# claude-test · anthropic-messages',
				'',
				'2026-01-01T00:00:00.000Z · project my-app · status 200 · 1234 ms · 120 in / 8 out tokens · stop end_turn',
				'',
				'## System',
				'',
				'You are terse.',
				'',
				'## Tools',
				'',
				'- `get_weather`: Weather for a city',
				'- `noop`',
				'',
				'## User',
				'',
				'Weather in Paris?',
				'',
				'## Assistant',
				'',
				'> *Thinking*',
				'>',
				'> Need the tool.',
				'>',
				'> Call it.',
				'',
				'**Tool call** `get_weather` (toolu_1)',
				'',
				'```json',
				'{',
				'  "city": "Paris"',
				'}',
				'```',
				'',
				'## User',
				'',
				'**Tool result** (toolu_1)',
				'',
				'```',
				'Sunny, 21 C',
				'```',
				'',
				'## Assistant (reply)',
				'',
				'Sunny.',
				'',
			].join('\n'),
		);
	});

	it('is undefined for a call that is not an LLM call', () => {
		expect(toMarkdown({ ...call, llm: undefined })).toBeUndefined();
	});

	it('shows what was read of a call whose reply could not be read, and why', () => {
		const text =
			toMarkdown({
				...call,
				llm: {
					...llm,
					output: undefined,
					parseError: 'response: Unexpected end of JSON input',
				},
			}) ?? '';
		expect(text).toContain('## User\n\n');
		expect(text).not.toContain('## Assistant (reply)');
		expect(text).toMatch(
			/## Error\n\nCould not read response: Unexpected end of JSON input\n$/,
		);
	});

	it('says a call is running and shows the reply so far', () => {
		const running: CapturedRequest = {
			...call,
			timings: { start: 1, firstByte: 2 },
			latency: undefined,
			llm: { ...llm, stopReason: undefined, usage: undefined },
		};
		const text = toMarkdown(running) ?? '';
		expect(text).toContain(
			'2026-01-01T00:00:00.000Z · project my-app · running\n',
		);
		expect(text).toContain('## Assistant (reply)\n\nSunny.\n');
	});

	it('uses a fence longer than any backtick run in the content', () => {
		const text = toMarkdown({
			...call,
			llm: {
				...llm,
				messages: [
					{
						role: 'tool',
						parts: [
							{
								type: 'tool_result',
								id: 't',
								content: 'a ```` b',
								isError: true,
							},
						],
					},
				],
			},
		});
		expect(text).toContain(
			'## Tool\n\n**Tool result** (t, error)\n\n`````\na ```` b\n`````',
		);
	});

	it('shows images as a marker and unknown blocks as JSON', () => {
		const text = toMarkdown({
			...call,
			llm: {
				...llm,
				messages: [
					{
						role: 'user',
						parts: [
							{ type: 'image' },
							{ type: 'other', raw: { type: 'doc' } },
						],
					},
				],
			},
		});
		expect(text).toContain(
			'## User\n\n[image]\n\n```json\n{\n  "type": "doc"\n}\n```',
		);
	});

	it('lists the provider error and the capture error', () => {
		const text = toMarkdown({
			...call,
			response: undefined,
			error: 'Upstream connection dropped',
			llm: {
				...llm,
				output: undefined,
				usage: { output: 3 },
				error: { type: 'overloaded_error', message: 'Overloaded' },
			},
		});
		expect(text).toContain('· no response · 1234 ms · ? in / 3 out tokens');
		expect(text).toMatch(
			/## Error\n\noverloaded_error: Overloaded\n\nUpstream connection dropped\n$/,
		);
	});

	it('writes a provider error without a type, and a call without a model', () => {
		const text = toMarkdown({
			...call,
			llm: {
				format: 'openai-chat',
				stream: false,
				messages: [{ role: 'assistant', parts: [] }],
				error: { message: 'Broken' },
			},
		});
		expect(text).toMatch(/^# unknown model · openai-chat\n/);
		expect(text).toContain('## Assistant\n\n## Error\n\nBroken\n');
	});
});
