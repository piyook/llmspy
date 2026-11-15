import type { CallQuery } from './store.js';
import { isProjectName } from './upstreams.js';

/** What `GET /api/requests` was asked for, or why it can not be answered. */
export type ListRequest =
	| { query: CallQuery; full: boolean }
	| { error: string };

/**
 * Reads the parameters of `GET /api/requests`: `project`, `q`, `since` (an
 * ISO time or epoch milliseconds), `limit` (a positive whole number) and
 * `full=1`. Anything it can not read is an error, so a typo never quietly
 * lists every call.
 */
export function parseListRequest(params: URLSearchParams): ListRequest {
	const project = params.get('project') ?? undefined;
	if (project !== undefined && !isProjectName(project)) {
		return { error: `"${project}" is not a project name.` };
	}

	const sinceParam = params.get('since');
	const since = sinceParam === null ? undefined : parseTime(sinceParam);
	if (Number.isNaN(since)) {
		return {
			error: `since must be an ISO time (2026-11-15T10:00:00Z) or epoch milliseconds, not "${sinceParam}".`,
		};
	}

	const limitParam = params.get('limit');
	if (limitParam !== null && !/^[1-9]\d*$/.test(limitParam)) {
		return {
			error: `limit must be a whole number above 0, not "${limitParam}".`,
		};
	}

	const fullParam = params.get('full');
	if (fullParam !== null && fullParam !== '1') {
		return { error: `full must be 1, not "${fullParam}".` };
	}

	return {
		query: {
			project,
			search: params.get('q') ?? '',
			since,
			limit: limitParam === null ? undefined : Number(limitParam),
		},
		full: fullParam === '1',
	};
}

/** Epoch ms from digits or an ISO time; NaN for anything else. */
function parseTime(value: string): number {
	if (/^\d+$/.test(value)) return Number(value);
	if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return Number.NaN;
	return Date.parse(value);
}
