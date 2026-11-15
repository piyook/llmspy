import type { CallSummary } from './types.js';

/** The calls of one local day, e.g. key `2026-11-15`. */
export interface DayGroup {
	key: string;
	calls: CallSummary[];
}

/** The local date of a time, as `YYYY-MM-DD`. */
export function dayKey(ms: number): string {
	const date = new Date(ms);
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

// A fixed format, e.g. `Thu 12 Nov`, whatever the browser's language.
// Only its parts are used: with a year it puts a comma after the weekday.
const DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	year: 'numeric',
});

/**
 * `Today`, `Yesterday`, `Thu 12 Nov`, or `Thu 12 Nov 2025` for a day in
 * another year than `now`.
 */
export function dayLabel(key: string, now: number): string {
	if (key === dayKey(now)) return 'Today';
	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	if (key === dayKey(yesterday.getTime())) return 'Yesterday';
	const [year, month, day] = key.split('-').map(Number);
	const date = new Date(year, month - 1, day);
	const parts = DATE_PARTS.formatToParts(date);
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value;
	const label = `${part('weekday')} ${part('day')} ${part('month')}`;
	return year === new Date(now).getFullYear()
		? label
		: `${label} ${part('year')}`;
}

/** The windows, in minutes, today's calls can be narrowed to. */
export const RECENT_MINUTES = [5, 15, 30, 60, 90] as const;

/** The calls that started in the `minutes` before `now`. */
export function withinLast(
	calls: CallSummary[],
	minutes: number,
	now: number,
): CallSummary[] {
	const since = now - minutes * 60_000;
	return calls.filter((call) => call.timings.start >= since);
}

/** Calls sorted newest first, grouped by local day, newest day first. */
export function groupByDay(calls: CallSummary[]): DayGroup[] {
	const groups: DayGroup[] = [];
	for (const call of calls) {
		const key = dayKey(call.timings.start);
		const last = groups.at(-1);
		if (last?.key === key) last.calls.push(call);
		else groups.push({ key, calls: [call] });
	}
	return groups;
}
