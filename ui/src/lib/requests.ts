import type { CapturedRequest } from './types.js';

/**
 * Where a call is: `waiting` for the response headers, `replying` while the
 * reply arrives, `done` once the exchange has ended (`timings.end` is set).
 */
export type CallState = 'waiting' | 'replying' | 'done';

export function callState(request: CapturedRequest): CallState {
	if (request.timings.end !== undefined) return 'done';
	return request.response ? 'replying' : 'waiting';
}

/** How long a stream may go without data before it is shown as quiet. */
const QUIET_AFTER_MS = 5000;

/**
 * How long, in ms, a running stream has gone without data, once that is
 * more than `QUIET_AFTER_MS`; otherwise undefined. A quiet stream is not
 * always stuck: a reasoning model can send nothing for a while. Only streams
 * passed on while they arrive have `timings.lastData`.
 */
export function quietFor(
	request: CapturedRequest,
	now: number,
): number | undefined {
	const { lastData, end } = request.timings;
	if (lastData === undefined || end !== undefined) return undefined;
	const quiet = now - lastData;
	return quiet > QUIET_AFTER_MS ? quiet : undefined;
}

/** Newest first, by when the request reached LLMSpy. */
export function newestFirst(a: CapturedRequest, b: CapturedRequest): number {
	return b.timings.start - a.timings.start;
}

/** Case-insensitive match on host, path and both bodies. */
export function matchesSearch(
	request: CapturedRequest,
	search: string,
): boolean {
	if (!search) return true;
	const term = search.toLowerCase();
	return [
		request.host,
		request.path,
		request.body,
		request.response?.body ?? '',
	].some((field) => field.toLowerCase().includes(term));
}
