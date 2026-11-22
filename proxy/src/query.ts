import type { CallQuery } from './store.js';
import type { CallFilters } from './summary.js';
import { isProjectName } from './upstreams.js';

/** What `GET /api/requests` was asked for, or why it can not be answered. */
export type ListRequest =
	| { query: CallQuery; full: boolean }
	| { error: string };

/**
 * Reads the parameters of `GET /api/requests`: `project`, `q`, `since` (an
 * ISO time or epoch milliseconds), `limit` (a positive whole number),
 * `full=1`, and the filters `model`, `status` and `failed=1`. Anything it
 * can not read is an error, so a typo never quietly lists every call.
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

	const filters = parseFilters(params);
	if ('error' in filters) return filters;

	return {
		query: {
			project,
			search: params.get('q') ?? '',
			since,
			limit: limitParam === null ? undefined : Number(limitParam),
			...filters,
		},
		full: fullParam === '1',
	};
}

/** What `GET /api/stats` or `GET /api/export` was asked for, or why it can not be answered. */
export type MatchesRequest = { query: CallQuery } | { error: string };

/**
 * Reads the parameters of `GET /api/stats`: the filters of `GET /api/requests`.
 * `limit` and `full` are errors, since the counts are over every match.
 */
export function parseStatsRequest(params: URLSearchParams): MatchesRequest {
	return parseEveryMatch(params, '/api/stats');
}

/**
 * Reads the parameters of `GET /api/export`: the filters of `GET /api/requests`.
 * `limit` and `full` are errors, since every match is exported in full.
 */
export function parseExportRequest(params: URLSearchParams): MatchesRequest {
	return parseEveryMatch(params, '/api/export');
}

function parseEveryMatch(
	params: URLSearchParams,
	route: string,
): MatchesRequest {
	for (const name of ['limit', 'full']) {
		if (params.has(name)) {
			return { error: `${name} does not apply to ${route}.` };
		}
	}
	const asked = parseListRequest(params);
	return 'error' in asked ? asked : { query: asked.query };
}

/**
 * Reads `model` (any text), `status` (`429`, or a class such as `5xx`) and
 * `failed=1`. Only the filters given are set.
 */
function parseFilters(
	params: URLSearchParams,
): CallFilters | { error: string } {
	const filters: CallFilters = {};

	const model = params.get('model');
	if (model !== null) {
		if (!model) return { error: 'model must not be empty.' };
		filters.model = model;
	}

	const status = params.get('status');
	if (status !== null) {
		if (!/^[1-5](\d\d|xx)$/.test(status)) {
			return {
				error: `status must be a status code (429) or a class (5xx), not "${status}".`,
			};
		}
		filters.status = status;
	}

	const failed = params.get('failed');
	if (failed !== null) {
		if (failed !== '1') {
			return { error: `failed must be 1, not "${failed}".` };
		}
		filters.failed = true;
	}

	return filters;
}

/** The longest `?wait=` takes, in seconds. */
const MAX_WAIT_SECONDS = 300;

/** How long a read of one call may wait for it to end, or why it can not. */
export type WaitRequest = { seconds?: number } | { error: string };

/**
 * Reads `wait` on the routes of one call: a whole number of seconds from 1 to
 * 300. Without it the call is answered as it is now.
 */
export function parseWait(params: URLSearchParams): WaitRequest {
	const wait = params.get('wait');
	if (wait === null) return {};
	if (!/^[1-9]\d*$/.test(wait) || Number(wait) > MAX_WAIT_SECONDS) {
		return {
			error: `wait must be a whole number of seconds from 1 to ${MAX_WAIT_SECONDS}, not "${wait}".`,
		};
	}
	return { seconds: Number(wait) };
}

/** Epoch ms from digits or an ISO time; NaN for anything else. */
function parseTime(value: string): number {
	if (/^\d+$/.test(value)) return Number(value);
	if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return Number.NaN;
	return Date.parse(value);
}
