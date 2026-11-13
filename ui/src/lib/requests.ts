import type { CapturedRequest } from './types.js';

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
