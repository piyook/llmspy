import type { CapturedRequest } from './types.js';

/** The project of a call sent without `/@<project>` in front of the upstream. */
export const DEFAULT_PROJECT = 'general';

/** `general` first, then every other project that has a call, A to Z. */
export function projectNames(requests: Iterable<CapturedRequest>): string[] {
	const names = new Set<string>();
	for (const { project } of requests) {
		if (project !== DEFAULT_PROJECT) names.add(project);
	}
	return [DEFAULT_PROJECT, ...[...names].sort()];
}

/** How many calls of `project` reached LLMSpy after `since` (epoch ms). */
export function countSince(
	requests: Iterable<CapturedRequest>,
	project: string,
	since: number,
): number {
	let count = 0;
	for (const request of requests) {
		if (request.project === project && request.timings.start > since)
			count++;
	}
	return count;
}
