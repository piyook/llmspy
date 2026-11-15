import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Rig, startRig } from './harness.js';

let rig: Rig;

beforeAll(async () => {
	rig = await startRig('claude', 'anthropic');
});

afterAll(async () => {
	await rig?.stop();
});

describe.each([
	{ mode: 'json', stream: false },
	{ mode: 'stream', stream: true },
])('a call as Markdown through llmock ($mode)', ({ stream }) => {
	it('serves the conversation with its tool call', async () => {
		const { record } = await rig.post(
			'/v1/messages',
			{ 'x-api-key': 'sk-ant-test-key' },
			{
				model: 'claude-mock',
				max_tokens: 256,
				stream,
				messages: [
					{ role: 'user', content: 'What is the weather? #tools' },
				],
			},
		);

		const res = await fetch(
			`${new URL(rig.base).origin}/api/requests/${record.id}/conversation`,
		);
		const text = await res.text();
		expect(res.status).toBe(200);
		expect(text).toMatch(/^# claude-mock · anthropic-messages\n/);
		expect(text).toContain('· status 200 ·');
		expect(text).toContain('· stop tool_use');
		expect(text).toContain('## User\n\nWhat is the weather? #tools\n');
		expect(text).toContain(
			'## Assistant (reply)\n\nLet me check the weather first.\n\n**Tool call** `get_weather`',
		);
		expect(text).toContain('"city": "Paris"');
	});
});
