import type { CallSummary } from './types.js';

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
