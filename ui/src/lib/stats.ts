// The proxy's own counts, so the cards and `GET /api/stats` agree.
import type { CallCounts } from '../../../proxy/src/stats.js';
import { formatLatency, formatTokens } from './format.js';

/** One card above the panes. */
export interface StatsCard {
	label: string;
	value: string;
	/** A second, smaller line. */
	detail?: string;
	/** Tooltip. */
	title?: string;
	/** Shown in the danger colour. */
	alert?: boolean;
}

/** The Calls, Failed, Tokens and Latency cards for `stats`. */
export function statsCards(stats: CallCounts): StatsCard[] {
	const { calls, running, failed, tokens, latencyMs } = stats;
	const cache = tokens.cacheRead > 0 || tokens.cacheWrite > 0;
	return [
		{
			label: 'Calls',
			value: String(calls),
			detail: running > 0 ? `${running} running` : undefined,
		},
		{
			label: 'Failed',
			value: String(failed),
			detail: calls > 0 ? percent(failed, calls) : undefined,
			title: 'An error, a status of 400 or above, or an error in the reply',
			alert: failed > 0,
		},
		{
			label: 'Tokens',
			value: `${formatTokens(tokens.input)} in · ${formatTokens(tokens.output)} out`,
			detail: cache
				? `${formatTokens(tokens.cacheRead)} cache read · ${formatTokens(tokens.cacheWrite)} written`
				: undefined,
			title: "Added up from what each reply reported. Anthropic's input leaves out cached tokens, OpenAI's includes them.",
		},
		latencyMs
			? {
					label: 'Latency',
					value: `p50 ${formatLatency(latencyMs.p50)}`,
					detail: `p95 ${formatLatency(latencyMs.p95)}`,
					title: `Of the calls that ended; the slowest took ${formatLatency(latencyMs.max)}`,
				}
			: {
					label: 'Latency',
					value: '–',
					title: 'Shown once a call has ended',
				},
	];
}

/**
 * `3%`; `<1%` for a share above 0 that rounds to 0, and `>99%` for a share
 * below the whole that rounds to 100.
 */
function percent(part: number, whole: number): string {
	const share = Math.round((part / whole) * 100);
	if (share === 0 && part > 0) return '<1%';
	if (share === 100 && part < whole) return '>99%';
	return `${share}%`;
}
