import type { CallSummary, CapturedRequest } from './types.js';

/** The fields of a record the list of calls shows. */
export function toSummary(captured: CapturedRequest): CallSummary {
	const { response, llm } = captured;
	return {
		id: captured.id,
		timestamp: captured.timestamp,
		project: captured.project,
		provider: captured.provider,
		host: captured.host,
		method: captured.method,
		path: captured.path,
		response: response && { status: response.status },
		timings: captured.timings,
		latency: captured.latency,
		error: captured.error,
		llm: llm && { model: llm.model, usage: llm.usage, error: llm.error },
	};
}

/** Case-insensitive match on host, path and both bodies; an empty search matches all. */
export function matchesSearch(
	captured: CapturedRequest,
	search: string,
): boolean {
	if (!search) return true;
	const term = search.toLowerCase();
	return [
		captured.host,
		captured.path,
		captured.body,
		captured.response?.body ?? '',
	].some((field) => field.toLowerCase().includes(term));
}
