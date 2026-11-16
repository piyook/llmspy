import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProxyServer } from './proxy.js';
import { RequestStore } from './store.js';

const SECRET = 'file-outside-the-ui-folder';

let tmp: string;
let base: string;
let proxy: ProxyServer;

beforeAll(async () => {
	// tmp/ui is served; tmp/secret.txt sits next to it and must stay out of reach.
	tmp = mkdtempSync(path.join(tmpdir(), 'llmspy-static-'));
	const uiDir = path.join(tmp, 'ui');
	mkdirSync(path.join(uiDir, 'assets'), { recursive: true });
	writeFileSync(path.join(uiDir, 'index.html'), '<!doctype html>ui');
	writeFileSync(path.join(uiDir, 'assets', 'app.js'), 'console.log(1)');
	writeFileSync(path.join(tmp, 'secret.txt'), SECRET);

	proxy = new ProxyServer(
		{
			port: 0,
			host: '127.0.0.1',
			upstreams: new Map([['fake', new URL('http://127.0.0.1:1')]]),
			uiDir,
			version: '0.0.0',
		},
		new RequestStore(),
	);
	const port = await proxy.start();
	base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
	await proxy.stop();
	rmSync(tmp, { recursive: true, force: true });
});

/** Raw request, so paths such as `/../x` reach the server unnormalised. */
function get(
	rawPath: string,
	method = 'GET',
): Promise<{
	status: number;
	headers: http.IncomingHttpHeaders;
	body: string;
}> {
	return new Promise((resolve, reject) => {
		const { port } = new URL(base);
		const req = http.request(
			{ host: '127.0.0.1', port, path: rawPath, method },
			(res) => {
				let body = '';
				res.setEncoding('utf8');
				res.on('data', (chunk: string) => {
					body += chunk;
				});
				res.on('end', () =>
					resolve({
						status: res.statusCode ?? 0,
						headers: res.headers,
						body,
					}),
				);
			},
		);
		req.on('error', reject);
		req.end();
	});
}

describe('serving the built UI', () => {
	it('serves index.html at /', async () => {
		const res = await get('/');
		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
		expect(res.body).toBe('<!doctype html>ui');
	});

	it('serves assets with their content type', async () => {
		const res = await get('/assets/app.js?v=1');
		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toBe(
			'text/javascript; charset=utf-8',
		);
		expect(res.body).toBe('console.log(1)');
	});

	it('answers HEAD without a body', async () => {
		const res = await get('/', 'HEAD');
		expect(res.status).toBe(200);
		expect(res.headers['content-length']).toBe('17');
		expect(res.body).toBe('');
	});

	it('does not serve files for other methods', async () => {
		expect((await get('/', 'POST')).status).toBe(404);
	});

	it('returns 404 for a missing file', async () => {
		const res = await get('/assets/missing.js');
		expect(res.status).toBe(404);
		expect(res.body).toMatch(/Known prefixes: \/fake/);
	});

	it.each([
		'/../secret.txt',
		'/assets/../../secret.txt',
		'/%2e%2e/secret.txt',
		'/assets/%2e%2e%2f%2e%2e%2fsecret.txt',
		'/..%5csecret.txt',
		'/%00index.html',
		'/%E0%A4%A',
	])('refuses %s', async (rawPath) => {
		const res = await get(rawPath);
		expect(res.status).toBe(404);
		expect(res.body).not.toContain(SECRET);
	});

	it('sends no wildcard CORS header on the API', async () => {
		const res = await get('/api/requests');
		expect(res.status).toBe(200);
		expect(res.headers['access-control-allow-origin']).toBeUndefined();
	});
});
