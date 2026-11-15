import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Rig, startRig } from './harness.js';

let rig: Rig;

beforeAll(async () => {
	rig = await startRig('claude', 'anthropic');
});

afterAll(async () => {
	await rig?.stop();
});

describe('stats over calls through llmock', () => {
	it('counts the calls, their tokens and latency per model', async () => {
		for (const stream of [false, true]) {
			await rig.post(
				'/v1/messages',
				{ 'x-api-key': 'sk-ant-test-key' },
				{
					model: 'claude-mock',
					max_tokens: 256,
					stream,
					messages: [{ role: 'user', content: 'Hello' }],
				},
			);
		}

		const res = await fetch(
			`${new URL(rig.base).origin}/api/stats?model=claude-mock`,
		);
		const stats = await res.json();
		expect(res.status).toBe(200);
		expect(stats).toMatchObject({ calls: 2, running: 0, failed: 0 });
		expect(stats.tokens.input).toBeGreaterThan(0);
		expect(stats.tokens.output).toBeGreaterThan(0);
		expect(stats.latencyMs.max).toBeGreaterThanOrEqual(stats.latencyMs.p50);
		expect(Object.keys(stats.byModel)).toEqual(['claude-mock']);
		expect(stats.byModel['claude-mock'].tokens).toEqual(stats.tokens);
	});
});
