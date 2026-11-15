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

/** How many of the calls each project has; a project with none is left out. */
export function countByProject(
	calls: Iterable<CallSummary>,
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const { project } of calls) {
		counts.set(project, (counts.get(project) ?? 0) + 1);
	}
	return counts;
}

/** The number on a project's tab, and what it counts. */
export interface TabBadge {
	count: number;
	match: boolean;
	label: string;
}

/**
 * A tab's badge: while searching (`matches` given) its number of matches,
 * else its new calls, which the tab being viewed has none of.
 */
export function tabBadge(
	project: string,
	current: string,
	unseen: (project: string) => number,
	matches?: Map<string, number>,
): TabBadge {
	if (matches) {
		const count = matches.get(project) ?? 0;
		return { count, match: true, label: count === 1 ? 'match' : 'matches' };
	}
	const count = project === current ? 0 : unseen(project);
	return { count, match: false, label: 'new' };
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
