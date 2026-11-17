import { describe, expect, it } from 'vitest';
import { listUpstreams, parseUpstreams, resolveRoute } from './upstreams.js';

describe('parseUpstreams', () => {
	it('has anthropic and openai by default', () => {
		const upstreams = parseUpstreams(undefined);
		expect(upstreams.get('anthropic')?.href).toBe(
			'https://api.anthropic.com/',
		);
		expect(upstreams.get('openai')?.href).toBe('https://api.openai.com/');
	});

	it('adds and overrides upstreams from the spec', () => {
		const upstreams = parseUpstreams(
			' ollama=http://localhost:11434 , openai=https://proxy.example/v1',
		);
		expect(upstreams.get('ollama')?.href).toBe('http://localhost:11434/');
		expect(upstreams.get('openai')?.href).toBe('https://proxy.example/v1');
		expect(upstreams.has('anthropic')).toBe(true);
	});

	it.each([
		['no equals sign', 'ollama'],
		['empty name', '=http://localhost'],
		['reserved name', 'api=http://localhost'],
		['name of the UI assets folder', 'assets=http://localhost'],
		['bad name', 'My_Host=http://localhost'],
		['invalid url', 'ollama=localhost:11434'],
		['non-http url', 'ollama=ftp://localhost'],
		[
			'name given twice',
			'mock=http://localhost:8001,mock=http://localhost:8002',
		],
		['name given twice in another case', 'mock=http://a,MOCK=http://b'],
	])('rejects %s', (_label, spec) => {
		expect(() => parseUpstreams(spec)).toThrow(/LLMSPY_UPSTREAMS/);
	});
});

describe('listUpstreams', () => {
	it('lists each upstream in configuration order', () => {
		expect(
			listUpstreams(parseUpstreams('ollama=http://localhost:11434')),
		).toEqual([
			{ name: 'anthropic', target: 'https://api.anthropic.com/' },
			{ name: 'openai', target: 'https://api.openai.com/' },
			{ name: 'ollama', target: 'http://localhost:11434/' },
		]);
	});

	it('leaves out any user name and password in a target', () => {
		const upstreams = parseUpstreams(
			'private=https://user:secret@llm.test/v1',
		);

		expect(listUpstreams(upstreams).at(-1)).toEqual({
			name: 'private',
			target: 'https://llm.test/v1',
		});
		// The configured URL itself still has them, for forwarding.
		expect(upstreams.get('private')?.password).toBe('secret');
	});
});

describe('resolveRoute', () => {
	const upstreams = new Map([
		['anthropic', new URL('https://api.anthropic.com')],
		['local', new URL('http://localhost:11434/v1/')],
	]);

	it('forwards the rest of the path and the query', () => {
		const route = resolveRoute(
			'/anthropic/v1/messages?beta=true',
			upstreams,
		);
		expect(route?.provider).toBe('anthropic');
		expect(route?.project).toBe('general');
		expect(route?.target.href).toBe(
			'https://api.anthropic.com/v1/messages?beta=true',
		);
	});

	it('takes a project from /@<project> in front and does not forward it', () => {
		const route = resolveRoute(
			'/@my-app2/anthropic/v1/messages?x=1',
			upstreams,
		);
		expect(route?.project).toBe('my-app2');
		expect(route?.provider).toBe('anthropic');
		expect(route?.target.href).toBe(
			'https://api.anthropic.com/v1/messages?x=1',
		);
	});

	it.each([
		['an empty project', '/@/anthropic/v1/messages'],
		['a project with capitals', '/@MyApp/anthropic/v1/messages'],
		['a project with an underscore', '/@my_app/anthropic/v1/messages'],
		['a project and no upstream', '/@my-app'],
		['a project and an unknown upstream', '/@my-app/unknown/v1'],
		['two projects', '/@a/@b/anthropic/v1/messages'],
	])('matches nothing for %s', (_label, url) => {
		expect(resolveRoute(url, upstreams)).toBeUndefined();
	});

	it('appends to an upstream base path', () => {
		expect(
			resolveRoute('/local/chat/completions', upstreams)?.target.href,
		).toBe('http://localhost:11434/v1/chat/completions');
	});

	it('handles a bare prefix', () => {
		expect(resolveRoute('/anthropic', upstreams)?.target.href).toBe(
			'https://api.anthropic.com/',
		);
		expect(resolveRoute('/anthropic?x=1', upstreams)?.target.href).toBe(
			'https://api.anthropic.com/?x=1',
		);
	});

	it('keeps a path that looks like another host on the same upstream', () => {
		expect(
			resolveRoute('/anthropic//evil.example/x', upstreams)?.target.host,
		).toBe('api.anthropic.com');
	});

	it('matches whole path segments only', () => {
		expect(resolveRoute('/anthropicx/v1', upstreams)).toBeUndefined();
		expect(resolveRoute('/unknown/v1', upstreams)).toBeUndefined();
		expect(resolveRoute('/', upstreams)).toBeUndefined();
	});
});
