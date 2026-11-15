import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Rig, replyText, sseData, startRig } from './harness.js';

let rig: Rig;

beforeAll(async () => {
	rig = await startRig('chatgpt', 'openai');
});

afterAll(async () => {
	await rig?.stop();
});

function call(prompt: string, stream: boolean) {
	return rig.post(
		'/v1/chat/completions',
		{ authorization: 'Bearer sk-test-key' },
		{
			model: 'gpt-mock',
			stream,
			...(stream && { stream_options: { include_usage: true } }),
			messages: [{ role: 'user', content: prompt }],
		},
	);
}

/** The reply text as the client got it, from a JSON body or an event stream. */
function clientText(body: string, stream: boolean): string {
	type Choice = {
		delta?: { content?: string };
		message?: { content: string };
	};
	const chunks: Array<{ choices?: Choice[] }> = stream
		? (sseData(body) as Array<{ choices?: Choice[] }>)
		: [JSON.parse(body)];
	return chunks
		.flatMap((chunk) => chunk.choices ?? [])
		.map((choice) => choice.delta?.content ?? choice.message?.content ?? '')
		.join('');
}

describe.each([
	{ mode: 'json', stream: false },
	{ mode: 'stream', stream: true },
])('openai chat through llmock ($mode)', ({ stream }) => {
	it('passes the reply through unchanged and reads it', async () => {
		const { status, body, record } = await call('Hello there', stream);

		expect(status).toBe(200);
		expect(body).toBeDefined();
		expect(record.response?.body).toBe(body);
		expect(record.provider).toBe('openai');
		expect(record.headers.authorization).not.toContain('sk-test-key');
		expect(record.error).toBeUndefined();

		const llm = record.llm;
		expect(llm?.parseError).toBeUndefined();
		expect(llm?.format).toBe('openai-chat');
		expect(llm?.stream).toBe(stream);
		expect(llm?.messages).toEqual([
			{ role: 'user', parts: [{ type: 'text', text: 'Hello there' }] },
		]);
		expect(llm?.output?.role).toBe('assistant');
		expect(replyText(llm?.output)).toBe(clientText(body ?? '', stream));
		expect(replyText(llm?.output)).not.toBe('');
		expect(llm?.stopReason).toBe('stop');
		expect(llm?.usage?.input).toBeGreaterThan(0);
		expect(llm?.usage?.output).toBeGreaterThan(0);

		const { start, firstByte, end } = record.timings;
		expect(firstByte).toBeGreaterThanOrEqual(start);
		expect(end).toBeGreaterThanOrEqual(firstByte ?? Infinity);
	});

	it.each([
		['#max-tokens', 'length'],
		['#refusal', 'content_filter'],
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

describe('openai chat stream failures through llmock', () => {
	it('reads an error chunk that ends the stream', async () => {
		const { status, record } = await call('Hi #stream-error', true);

		expect(status).toBe(200);
		expect(record.llm?.error?.message).toBeTruthy();
		expect(record.llm?.output?.parts.length).toBeGreaterThan(0);
	});

	it('records a stream that breaks off, with the reply so far', async () => {
		const { body, record } = await call('Hi #stream-drop', true);

		expect(body).toBeUndefined();
		expect(record.error).toBeDefined();
		expect(record.response?.body).toContain('chat.completion.chunk');
		expect(record.llm?.output?.parts.length).toBeGreaterThan(0);
	});
});
