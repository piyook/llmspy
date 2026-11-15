import { isFailed } from './failed.js';
import type { CallSummary, CapturedRequest } from './types.js';

/** Filters read from a call's summary. Every field is optional; together they all apply. */
export interface CallFilters {
	/** Only calls whose model name holds this text, ignoring case. */
	model?: string;
	/** Only calls with this HTTP status (`429`), or in this class (`5xx`). */
	status?: string;
	/** Only calls that `isFailed`. */
	failed?: boolean;
}

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

/** Whether a call's summary passes every filter given. */
export function matchesFilters(
	summary: CallSummary,
	{ model, status, failed }: CallFilters,
): boolean {
	if (
		model !== undefined &&
		!summary.llm?.model?.toLowerCase().includes(model.toLowerCase())
	) {
		return false;
	}
	if (
		status !== undefined &&
		!matchesStatus(summary.response?.status, status)
	) {
		return false;
	}
	return !failed || isFailed(summary);
}

/** `429` matches that status only, `5xx` any status from 500 to 599. */
function matchesStatus(actual: number | undefined, wanted: string): boolean {
	if (actual === undefined) return false;
	const code = String(actual);
	return wanted.endsWith('xx') ? code[0] === wanted[0] : code === wanted;
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
