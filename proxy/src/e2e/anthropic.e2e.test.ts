import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Rig, replyText, sseData, startRig } from './harness.js';

let rig: Rig;

beforeAll(async () => {
	rig = await startRig('claude', 'anthropic');
});

afterAll(async () => {
	await rig?.stop();
});

function call(prompt: string, stream: boolean) {
	return rig.post(
		'/v1/messages',
		{ 'x-api-key': 'sk-ant-test-key' },
		{
			model: 'claude-mock',
			max_tokens: 256,
			stream,
			messages: [{ role: 'user', content: prompt }],
		},
	);
}

/** The reply text as the client got it, from a JSON body or an event stream. */
function clientText(body: string, stream: boolean): string {
	type Block = { type: string; text?: string };
	type Event = { delta?: Block };
	const blocks: Block[] = stream
		? (sseData(body) as Event[]).flatMap((event) => event.delta ?? [])
		: JSON.parse(body).content;
	return blocks.map((block) => block.text ?? '').join('');
}

describe.each([
	{ mode: 'json', stream: false },
	{ mode: 'stream', stream: true },
])('anthropic through llmock ($mode)', ({ stream }) => {
	it('passes the reply through unchanged and reads it', async () => {
		const { status, body, record } = await call('Hello there', stream);

		expect(status).toBe(200);
		expect(body).toBeDefined();
		expect(record.response?.body).toBe(body);
		expect(record.provider).toBe('anthropic');
		expect(record.headers['x-api-key']).not.toContain('sk-ant-test-key');
		expect(record.error).toBeUndefined();

		const llm = record.llm;
		expect(llm?.parseError).toBeUndefined();
		expect(llm?.format).toBe('anthropic-messages');
		expect(llm?.stream).toBe(stream);
		expect(llm?.messages).toEqual([
			{ role: 'user', parts: [{ type: 'text', text: 'Hello there' }] },
		]);
		expect(llm?.output?.role).toBe('assistant');
		expect(replyText(llm?.output)).toBe(clientText(body ?? '', stream));
		expect(replyText(llm?.output)).not.toBe('');
		expect(llm?.stopReason).toBe('end_turn');
		expect(llm?.usage?.input).toBeGreaterThan(0);
		expect(llm?.usage?.output).toBeGreaterThan(0);

		const { start, firstByte, end } = record.timings;
		expect(firstByte).toBeGreaterThanOrEqual(start);
		expect(end).toBeGreaterThanOrEqual(firstByte ?? Infinity);
	});

	it('reads a tool call', async () => {
		const { record } = await call('What is the weather? #tools', stream);

		expect(record.llm?.stopReason).toBe('tool_use');
		expect(record.llm?.output?.parts).toEqual([
			{ type: 'text', text: 'Let me check the weather first.' },
			{
				type: 'tool_call',
				id: expect.any(String),
				name: 'get_weather',
				input: { city: 'Paris' },
			},
		]);
	});

	it.each([
		['#max-tokens', 'max_tokens'],
		['#refusal', 'refusal'],
	])('reads the stop reason for %s', async (marker, stopReason) => {
		const { record } = await call(`Go on ${marker}`, stream);

		expect(record.llm?.stopReason).toBe(stopReason);
	});

	it('keeps a 429 as it came, without parsing it', async () => {
		const { status, body, record } = await call('Hi #rate-limit', stream);

		expect(status).toBe(429);
		expect(record.response?.status).toBe(429);
		expect(record.response?.body).toBe(body);
		expect(record.llm?.parseError).toBeUndefined();
		expect(record.llm?.output).toBeUndefined();
	});
});

describe('anthropic stream failures through llmock', () => {
	it('reads an error event that ends the stream', async () => {
		const { status, record } = await call('Hi #stream-error', true);

		expect(status).toBe(200);
		expect(record.llm?.error?.type).toBe('overloaded_error');
		expect(record.llm?.output?.parts.length).toBeGreaterThan(0);
	});

	it('records a stream that breaks off, with the reply so far', async () => {
		const { body, record } = await call('Hi #stream-drop', true);

		expect(body).toBeUndefined();
		expect(record.error).toBeDefined();
		expect(record.response?.body).toContain('message_start');
		expect(record.llm?.output?.parts.length).toBeGreaterThan(0);
	});
});
