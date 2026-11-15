import { isFailed } from './failed.js';
import type { CallSummary } from './types.js';

/** Token counts added up over calls; a call that reported none adds 0. */
export interface TokenTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

/** Latency of the calls that ended, in ms, by nearest rank. */
export interface LatencyStats {
	p50: number;
	p95: number;
	max: number;
}

/** Counts over a set of calls. */
export interface CallCounts {
	calls: number;
	/** Calls not ended yet. */
	running: number;
	/** Calls that `isFailed`. */
	failed: number;
	tokens: TokenTotals;
	/** `null` when none of the calls has ended. */
	latencyMs: LatencyStats | null;
}

/** What `GET /api/stats` answers: the counts, and the same counts per model and per project. */
export interface CallStats extends CallCounts {
	/** Keyed by model name; `none` for calls with no model. */
	byModel: Record<string, CallCounts>;
	byProject: Record<string, CallCounts>;
}

/** The key in `byModel` for calls with no model (not LLM calls, or failed before one was read). */
export const NO_MODEL = 'none';

/** Counts over `summaries`, in all and per model and project. */
export function toStats(summaries: CallSummary[]): CallStats {
	return {
		...toCounts(summaries),
		byModel: countBy(summaries, (s) => s.llm?.model ?? NO_MODEL),
		byProject: countBy(summaries, (s) => s.project),
	};
}

function countBy(
	summaries: CallSummary[],
	key: (summary: CallSummary) => string,
): Record<string, CallCounts> {
	const groups = new Map<string, CallSummary[]>();
	for (const summary of summaries) {
		const name = key(summary);
		const group = groups.get(name);
		if (group) group.push(summary);
		else groups.set(name, [summary]);
	}
	// fromEntries defines each key as its own property, so a model named
	// `__proto__` is a key like any other rather than setting the prototype.
	return Object.fromEntries(
		[...groups].map(([name, group]) => [name, toCounts(group)]),
	);
}

/** The counts over `summaries`, without the per-model and per-project ones. */
export function toCounts(summaries: CallSummary[]): CallCounts {
	const tokens: TokenTotals = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	};
	const latencies: number[] = [];
	let running = 0;
	let failed = 0;
	for (const summary of summaries) {
		const usage = summary.llm?.usage;
		tokens.input += usage?.input ?? 0;
		tokens.output += usage?.output ?? 0;
		tokens.cacheRead += usage?.cacheRead ?? 0;
		tokens.cacheWrite += usage?.cacheWrite ?? 0;
		if (summary.timings.end === undefined) running++;
		else if (summary.latency !== undefined) latencies.push(summary.latency);
		if (isFailed(summary)) failed++;
	}
	return {
		calls: summaries.length,
		running,
		failed,
		tokens,
		latencyMs: toLatency(latencies),
	};
}

function toLatency(latencies: number[]): LatencyStats | null {
	if (latencies.length === 0) return null;
	const sorted = [...latencies].sort((a, b) => a - b);
	return {
		p50: nearestRank(sorted, 50),
		p95: nearestRank(sorted, 95),
		max: sorted[sorted.length - 1],
	};
}

/** The value at rank ceil(p% of n) in `sorted` (ascending, not empty). */
function nearestRank(sorted: number[], percent: number): number {
	return sorted[Math.ceil((percent / 100) * sorted.length) - 1];
}
