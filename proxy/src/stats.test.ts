import { describe, expect, it } from 'vitest';
import { NO_MODEL, toStats } from './stats.js';
import type { CallSummary } from './types.js';

let next = 0;

/** An ended 200 call of `latency` ms; `extra` overrides any field. */
function call(latency: number, extra: Partial<CallSummary> = {}): CallSummary {
	next++;
	return {
		id: `c${next}`,
		timestamp: '2026-01-01T00:00:00.000Z',
		project: 'general',
		provider: 'anthropic',
		host: 'api.anthropic.com',
		method: 'POST',
		path: '/v1/messages',
		response: { status: 200 },
		timings: { start: 0, end: latency },
		latency,
		...extra,
	};
}

const running = (extra: Partial<CallSummary> = {}): CallSummary =>
	call(0, { timings: { start: 0 }, latency: undefined, ...extra });

describe('toStats', () => {
	it('answers zeros and no latency for no calls', () => {
		expect(toStats([])).toEqual({
			calls: 0,
			running: 0,
			failed: 0,
			tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			latencyMs: null,
			byModel: {},
			byProject: {},
		});
	});

	it('adds up tokens, treating missing counts as 0', () => {
		const { tokens } = toStats([
			call(1, {
				llm: {
					model: 'm',
					usage: {
						input: 10,
						output: 5,
						cacheRead: 100,
						cacheWrite: 7,
					},
				},
			}),
			call(1, { llm: { model: 'm', usage: { input: 3 } } }),
			call(1),
		]);
		expect(tokens).toEqual({
			input: 13,
			output: 5,
			cacheRead: 100,
			cacheWrite: 7,
		});
	});

	it('counts running and failed calls, and takes latency from ended calls only', () => {
		const stats = toStats([
			call(100),
			call(300, { response: { status: 500 } }),
			call(200, { error: 'socket hang up' }),
			running(),
		]);
		expect(stats).toMatchObject({ calls: 4, running: 1, failed: 2 });
		expect(stats.latencyMs).toEqual({ p50: 200, p95: 300, max: 300 });
	});

	it('takes percentiles by nearest rank', () => {
		const latencies = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
		expect(toStats(latencies.map((ms) => call(ms))).latencyMs).toEqual({
			p50: 100,
			p95: 190,
			max: 200,
		});
		expect(toStats([call(42)]).latencyMs).toEqual({
			p50: 42,
			p95: 42,
			max: 42,
		});
	});

	it('gives no latency while every call is running', () => {
		expect(toStats([running()]).latencyMs).toBeNull();
	});

	it('counts per model, with calls that have none under none', () => {
		const { byModel } = toStats([
			call(10, { llm: { model: 'claude-a' } }),
			call(30, { llm: { model: 'claude-a' } }),
			call(20, { llm: {} }),
			running(),
		]);
		expect(Object.keys(byModel)).toEqual(['claude-a', NO_MODEL]);
		expect(byModel['claude-a']).toMatchObject({
			calls: 2,
			latencyMs: { p50: 10, p95: 30, max: 30 },
		});
		expect(byModel[NO_MODEL]).toMatchObject({ calls: 2, running: 1 });
		expect(byModel['claude-a']).not.toHaveProperty('byModel');
	});

	it('keeps a model named __proto__ as a key of its own', () => {
		const { byModel } = toStats([
			call(10, { llm: { model: '__proto__' } }),
		]);
		expect(Object.keys(byModel)).toEqual(['__proto__']);
		expect(Object.getPrototypeOf(byModel)).toBe(Object.prototype);
		expect(JSON.stringify(byModel)).toContain('"__proto__":{"calls":1');
	});

	it('counts per project', () => {
		const { byProject } = toStats([
			call(10, { project: 'site-agent', response: { status: 429 } }),
			call(10),
		]);
		expect(byProject['site-agent']).toMatchObject({ calls: 1, failed: 1 });
		expect(byProject.general).toMatchObject({ calls: 1, failed: 0 });
	});
});
