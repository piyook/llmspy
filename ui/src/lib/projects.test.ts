import { describe, expect, it } from 'vitest';
import {
	countByProject,
	countSince,
	projectNames,
	tabBadge,
} from './projects.js';
import type { CapturedRequest } from './types.js';

function call(project: string, start = 0): CapturedRequest {
	return {
		id: `${project}-${start}`,
		timestamp: new Date(start).toISOString(),
		project,
		provider: 'anthropic',
		host: 'api.anthropic.com',
		method: 'POST',
		path: '/v1/messages',
		headers: {},
		body: '{}',
		timings: { start },
	};
}

describe('projectNames', () => {
	it('is only general when there are no calls', () => {
		expect(projectNames([])).toEqual(['general']);
	});

	it('puts general first, then each other project once, A to Z', () => {
		expect(
			projectNames([
				call('zeta'),
				call('alpha'),
				call('general'),
				call('zeta'),
			]),
		).toEqual(['general', 'alpha', 'zeta']);
	});
});

describe('countByProject', () => {
	it('counts the calls of each project', () => {
		expect(
			countByProject([
				call('app', 1),
				call('general', 2),
				call('app', 3),
			]),
		).toEqual(
			new Map([
				['app', 2],
				['general', 1],
			]),
		);
	});

	it('is empty for no calls', () => {
		expect(countByProject([]).size).toBe(0);
	});
});

describe('tabBadge', () => {
	const unseen = (project: string) => (project === 'app' ? 3 : 0);

	it('counts new calls, none on the tab being viewed', () => {
		expect(tabBadge('app', 'general', unseen)).toEqual({
			count: 3,
			match: false,
			label: 'new',
		});
		expect(tabBadge('app', 'app', unseen).count).toBe(0);
	});

	it('counts matches while searching, on every tab', () => {
		const matches = new Map([
			['app', 1],
			['general', 2],
		]);
		expect(tabBadge('app', 'general', unseen, matches)).toEqual({
			count: 1,
			match: true,
			label: 'match',
		});
		expect(tabBadge('general', 'general', unseen, matches)).toEqual({
			count: 2,
			match: true,
			label: 'matches',
		});
		expect(tabBadge('other', 'general', unseen, matches).count).toBe(0);
	});
});

describe('countSince', () => {
	it('counts the calls of one project that arrived after a time', () => {
		const calls = [call('app', 100), call('app', 200), call('app', 300)];
		expect(countSince([...calls, call('other', 400)], 'app', 150)).toBe(2);
		expect(countSince(calls, 'app', 300)).toBe(0);
	});
});
