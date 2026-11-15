import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CallSummary, CapturedRequest } from '../types.js';
import { type Rig, startRig } from './harness.js';

let rig: Rig;
let origin: string;

beforeAll(async () => {
	rig = await startRig('claude', 'anthropic');
	origin = new URL(rig.base).origin;
});

afterAll(async () => {
	await rig?.stop();
});

describe('waiting for a call through llmock', () => {
	it('reads a stream that is still running once it ends', async () => {
		const call = fetch(`${rig.base}/v1/messages`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-api-key': 'sk-ant-test-key',
			},
			body: JSON.stringify({
				model: 'claude-mock',
				max_tokens: 256,
				stream: true,
				messages: [{ role: 'user', content: 'Say hello' }],
			}),
		});

		// llmock spaces its stream events 50 ms apart, so the call is still
		// running when its summary first shows up.
		const running = await vi.waitFor(async () => {
			const res = await fetch(`${origin}/api/requests?limit=1`);
			const [summary] = (await res.json()) as CallSummary[];
			expect(summary).toBeDefined();
			return summary;
		});
		expect(running.timings.end).toBeUndefined();

		const res = await fetch(`${origin}/api/requests/${running.id}?wait=5`);
		expect(res.status).toBe(200);
		const record = (await res.json()) as CapturedRequest;
		expect(record.timings.end).toBeDefined();
		expect(record.llm?.output?.parts.length).toBeGreaterThan(0);

		await (await call).text();
	});
});
