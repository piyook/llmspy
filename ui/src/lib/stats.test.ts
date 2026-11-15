import { describe, expect, it } from 'vitest';
import type { CallCounts } from '../../../proxy/src/stats.js';
import { statsCards } from './stats.js';

const none: CallCounts = {
	calls: 0,
	running: 0,
	failed: 0,
	tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	latencyMs: null,
};

const card = (stats: CallCounts, label: string) =>
	statsCards(stats).find((c) => c.label === label);

describe('statsCards', () => {
	it('shows Calls, Failed, Tokens and Latency in that order', () => {
		expect(statsCards(none).map(({ label }) => label)).toEqual([
			'Calls',
			'Failed',
			'Tokens',
			'Latency',
		]);
	});

	it('says how many calls are running, only when some are', () => {
		expect(card(none, 'Calls')).toMatchObject({
			value: '0',
			detail: undefined,
		});
		expect(card({ ...none, calls: 4, running: 1 }, 'Calls')).toMatchObject({
			value: '4',
			detail: '1 running',
		});
	});

	it('shows failed calls as a share, in the danger colour above 0', () => {
		expect(card(none, 'Failed')).toMatchObject({
			value: '0',
			detail: undefined,
			alert: false,
		});
		expect(card({ ...none, calls: 40, failed: 3 }, 'Failed')).toMatchObject(
			{
				value: '3',
				detail: '8%',
				alert: true,
			},
		);
		expect(card({ ...none, calls: 500, failed: 1 }, 'Failed')?.detail).toBe(
			'<1%',
		);
		expect(
			card({ ...none, calls: 400, failed: 399 }, 'Failed')?.detail,
		).toBe('>99%');
		expect(card({ ...none, calls: 4, failed: 4 }, 'Failed')?.detail).toBe(
			'100%',
		);
	});

	it('shows cache tokens only when there are some', () => {
		const tokens = {
			input: 51_234,
			output: 8400,
			cacheRead: 0,
			cacheWrite: 0,
		};
		expect(card({ ...none, tokens }, 'Tokens')).toMatchObject({
			value: '51.2k in · 8.4k out',
			detail: undefined,
		});
		expect(
			card(
				{
					...none,
					tokens: { ...tokens, cacheRead: 310_000, cacheWrite: 900 },
				},
				'Tokens',
			)?.detail,
		).toBe('310.0k cache read · 900 written');
	});

	it('shows p50 and p95, with the slowest in the tooltip, once a call has ended', () => {
		expect(card(none, 'Latency')).toMatchObject({ value: '–' });
		expect(
			card(
				{ ...none, latencyMs: { p50: 800, p95: 6400, max: 7100 } },
				'Latency',
			),
		).toEqual({
			label: 'Latency',
			value: 'p50 800ms',
			detail: 'p95 6.40s',
			title: 'Of the calls that ended; the slowest took 7.10s',
		});
	});
});
