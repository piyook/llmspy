import { describe, expect, it } from 'vitest';
import { parseListRequest } from './query.js';

const parse = (query: string) => parseListRequest(new URLSearchParams(query));

describe('parseListRequest', () => {
	it('lists every call in summary when nothing is asked', () => {
		expect(parse('')).toEqual({
			query: {
				project: undefined,
				search: '',
				since: undefined,
				limit: undefined,
			},
			full: false,
		});
	});

	it('reads every parameter', () => {
		expect(
			parse('project=my-app&q=hello&since=1000&limit=5&full=1'),
		).toEqual({
			query: {
				project: 'my-app',
				search: 'hello',
				since: 1000,
				limit: 5,
			},
			full: true,
		});
	});

	it('takes since as an ISO time', () => {
		expect(parse('since=2026-11-15T10:00:00Z')).toMatchObject({
			query: { since: Date.UTC(2026, 10, 15, 10) },
		});
		expect(parse('since=2026-11-15T10:00:00.500%2B01:00')).toMatchObject({
			query: { since: Date.UTC(2026, 10, 15, 9, 0, 0, 500) },
		});
	});

	it('refuses a since it can not read', () => {
		for (const since of [
			'',
			'yesterday',
			'Nov 15 2026',
			'2026-13-45',
			'-5',
		]) {
			expect(parse(`since=${since}`)).toEqual({
				error: expect.stringContaining('since must be'),
			});
		}
	});

	it('refuses a limit that is not a whole number above 0', () => {
		for (const limit of ['', '0', '-1', '1.5', 'ten', '05']) {
			expect(parse(`limit=${limit}`)).toEqual({
				error: expect.stringContaining('limit must be'),
			});
		}
	});

	it('refuses a full that is not 1', () => {
		for (const full of ['', '0', 'true']) {
			expect(parse(`full=${full}`)).toEqual({
				error: expect.stringContaining('full must be 1'),
			});
		}
	});

	it('refuses a name that can not be a project', () => {
		expect(parse('project=Not%20One')).toEqual({
			error: expect.stringContaining('is not a project name'),
		});
	});
});
