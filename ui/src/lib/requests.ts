// The proxy's own rule, so the Failed chip and `?failed=1` agree.
import { isFailed } from '../../../proxy/src/failed.js';
import type { CallSummary } from './types.js';

/** What the list is narrowed to. */
export interface ListView {
	project: string;
	/** The ids that match the search, or undefined for no search (or no answer yet). */
	matches?: ReadonlySet<string>;
}

/** Whether a call is in the list: in the project and matching the search. */
export function isShown(
	call: CallSummary,
	{ project, matches }: ListView,
): boolean {
	return call.project === project && (!matches || matches.has(call.id));
}

/** The calls that failed, in order. */
export function onlyFailed(calls: CallSummary[]): CallSummary[] {
	return calls.filter(isFailed);
}

/** How many of the calls failed. */
export function countFailed(calls: Iterable<CallSummary>): number {
	let count = 0;
	for (const call of calls) if (isFailed(call)) count++;
	return count;
}

/**
 * Where a call is: `waiting` for the response headers, `replying` while the
 * reply arrives, `done` once the exchange has ended (`timings.end` is set).
 */
export type CallState = 'waiting' | 'replying' | 'done';

export function callState(call: CallSummary): CallState {
	if (call.timings.end !== undefined) return 'done';
	return call.response ? 'replying' : 'waiting';
}

/** How long a stream may go without data before it is shown as quiet. */
const QUIET_AFTER_MS = 5000;

/**
 * How long, in ms, a running stream has gone without data, once that is
 * more than `QUIET_AFTER_MS`; otherwise undefined. A quiet stream is not
 * always stuck: a reasoning model can send nothing for a while. Only streams
 * passed on while they arrive have `timings.lastData`.
 */
export function quietFor(call: CallSummary, now: number): number | undefined {
	const { lastData, end } = call.timings;
	if (lastData === undefined || end !== undefined) return undefined;
	const quiet = now - lastData;
	return quiet > QUIET_AFTER_MS ? quiet : undefined;
}

/** Newest first, by when the request reached LLMSpy. */
export function newestFirst(a: CallSummary, b: CallSummary): number {
	return b.timings.start - a.timings.start;
}
