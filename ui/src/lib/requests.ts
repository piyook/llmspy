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
