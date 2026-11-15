import { describe, expect, it } from 'vitest';
import { countSince, projectNames } from './projects.js';
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

describe('countSince', () => {
	it('counts the calls of one project that arrived after a time', () => {
		const calls = [call('app', 100), call('app', 200), call('app', 300)];
		expect(countSince([...calls, call('other', 400)], 'app', 150)).toBe(2);
		expect(countSince(calls, 'app', 300)).toBe(0);
	});
});
