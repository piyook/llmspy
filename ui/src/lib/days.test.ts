import { describe, expect, it } from 'vitest';
import { dayKey, dayLabel, groupByDay, withinLast } from './days.js';
import type { CallSummary } from './types.js';

// Local times, so the tests pass in any time zone.
const at = (month: number, day: number, hour = 12, year = 2026) =>
	new Date(year, month - 1, day, hour).getTime();

function call(start: number): CallSummary {
	return {
		id: String(start),
		timestamp: new Date(start).toISOString(),
		project: 'general',
		provider: 'anthropic',
		host: 'api.anthropic.com',
		method: 'POST',
		path: '/v1/messages',
		timings: { start },
	};
}

describe('dayKey', () => {
	it('is the local date', () => {
		expect(dayKey(at(11, 5, 0))).toBe('2026-11-05');
		expect(dayKey(at(11, 5, 23))).toBe('2026-11-05');
	});
});

describe('dayLabel', () => {
	const now = at(11, 15, 9);

	it('names today and yesterday', () => {
		expect(dayLabel('2026-11-15', now)).toBe('Today');
		expect(dayLabel('2026-11-14', now)).toBe('Yesterday');
	});

	it('counts yesterday across a month and a year', () => {
		expect(dayLabel('2026-10-31', at(11, 1))).toBe('Yesterday');
		expect(dayLabel('2025-12-31', at(1, 1))).toBe('Yesterday');
	});

	it('gives the weekday and date of an older day', () => {
		expect(dayLabel('2026-11-12', now)).toBe('Thu 12 Nov');
	});

	it('adds the year for a day in another year', () => {
		expect(dayLabel('2025-11-12', now)).toBe('Wed 12 Nov 2025');
	});
});

describe('withinLast', () => {
	const now = at(11, 15, 12);
	const minutesAgo = (minutes: number) => call(now - minutes * 60_000);

	it('keeps the calls that started in the window, in order', () => {
		const calls = [minutesAgo(1), minutesAgo(4), minutesAgo(6)];
		expect(withinLast(calls, 5, now)).toEqual([calls[0], calls[1]]);
	});

	it('keeps a call that started exactly at the edge', () => {
		const edge = minutesAgo(5);
		expect(withinLast([edge], 5, now)).toEqual([edge]);
	});

	it('is empty when no call is that recent', () => {
		expect(withinLast([minutesAgo(91)], 90, now)).toEqual([]);
	});
});

describe('groupByDay', () => {
	it('is empty for no calls', () => {
		expect(groupByDay([])).toEqual([]);
	});

	it('groups calls by day, keeping their order', () => {
		const calls = [
			call(at(11, 15, 18)),
			call(at(11, 15, 8)),
			call(at(11, 13, 20)),
			call(at(11, 13, 1)),
			call(at(11, 12)),
		];
		expect(
			groupByDay(calls).map(({ key, calls }) => [
				key,
				calls.map(({ id }) => id),
			]),
		).toEqual([
			['2026-11-15', [calls[0].id, calls[1].id]],
			['2026-11-13', [calls[2].id, calls[3].id]],
			['2026-11-12', [calls[4].id]],
		]);
	});
});
