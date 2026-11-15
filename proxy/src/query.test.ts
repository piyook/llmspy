import { describe, expect, it } from 'vitest';
import { parseListRequest, parseWait } from './query.js';

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
			parse(
				'project=my-app&q=hello&since=1000&limit=5&full=1&model=Sonnet&status=429&failed=1',
			),
		).toEqual({
			query: {
				project: 'my-app',
				search: 'hello',
				since: 1000,
				limit: 5,
				model: 'Sonnet',
				status: '429',
				failed: true,
			},
			full: true,
		});
	});

	it('takes a status class', () => {
		expect(parse('status=5xx')).toMatchObject({ query: { status: '5xx' } });
	});

	it('refuses a status that is not a code or a class', () => {
		for (const status of ['', '42', '4299', '600', '099', 'x5x', '5XX']) {
			expect(parse(`status=${status}`)).toEqual({
				error: expect.stringContaining('status must be'),
			});
		}
	});

	it('refuses a failed that is not 1', () => {
		for (const failed of ['', '0', 'true']) {
			expect(parse(`failed=${failed}`)).toEqual({
				error: expect.stringContaining('failed must be 1'),
			});
		}
	});

	it('refuses an empty model', () => {
		expect(parse('model=')).toEqual({
			error: expect.stringContaining('model must not be empty'),
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

describe('parseWait', () => {
	const wait = (query: string) => parseWait(new URLSearchParams(query));

	it('does not wait when nothing is asked', () => {
		expect(wait('')).toEqual({});
	});

	it('reads whole seconds from 1 to 300', () => {
		expect(wait('wait=1')).toEqual({ seconds: 1 });
		expect(wait('wait=300')).toEqual({ seconds: 300 });
	});

	it('refuses anything else', () => {
		for (const seconds of ['', '0', '301', '-1', '1.5', 'yes', '05']) {
			expect(wait(`wait=${seconds}`)).toEqual({
				error: expect.stringContaining('wait must be'),
			});
		}
	});
});
