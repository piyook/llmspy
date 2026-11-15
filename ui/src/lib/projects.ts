import type { CallSummary } from './types.js';

/** The project of a call sent without `/@<project>` in front of the upstream. */
export const DEFAULT_PROJECT = 'general';

/** `general` first, then every other project that has a call, A to Z. */
export function projectNames(calls: Iterable<CallSummary>): string[] {
	const names = new Set<string>();
	for (const { project } of calls) {
		if (project !== DEFAULT_PROJECT) names.add(project);
	}
	return [DEFAULT_PROJECT, ...[...names].sort()];
}

/** How many calls of `project` reached LLMSpy after `since` (epoch ms). */
export function countSince(
	calls: Iterable<CallSummary>,
	project: string,
	since: number,
): number {
	let count = 0;
	for (const call of calls) {
		if (call.project === project && call.timings.start > since) count++;
	}
	return count;
}
