import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as zlib from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProxyServer } from './proxy.js';
import { RequestStore } from './store.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
	while (cleanups.length > 0) await cleanups.pop()?.();
});

async function listen(server: http.Server): Promise<string> {
	await new Promise<void>((resolve) =>
		server.listen(0, '127.0.0.1', resolve),
	);
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function startUpstream(handler: http.RequestListener): Promise<string> {
	const server = http.createServer(handler);
	const url = await listen(server);
	cleanups.push(
		() =>
			new Promise((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections();
			}),
	);
	return url;
}

async function startProxy(upstreamUrl: string) {
	const store = new RequestStore(10);
	const proxy = new ProxyServer(
		{
			port: 0,
			host: '127.0.0.1',
			upstreams: new Map([['fake', new URL(upstreamUrl)]]),
			maxRequests: 10,
		},
		store,
	);
	const port = await proxy.start();
	cleanups.push(() => proxy.stop());
	return { store, base: `http://127.0.0.1:${port}` };
}

function request(
	url: string,
	options: {
		method?: string;
		headers?: http.OutgoingHttpHeaders;
		body?: string;
	} = {},
): Promise<http.IncomingMessage> {
	return new Promise((resolve, reject) => {
		const req = http.request(
			url,
			{ method: options.method ?? 'GET', headers: options.headers },
			resolve,
		);
		req.on('error', reject);
		req.end(options.body);
	});
}

function readAll(res: http.IncomingMessage): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		res.on('data', (chunk: Buffer) => chunks.push(chunk));
		res.on('end', () => resolve(Buffer.concat(chunks)));
		res.on('error', reject);
	});
}

async function onlyCaptured(store: RequestStore) {
	await vi.waitFor(() => expect(store.getRequests()).toHaveLength(1));
	return store.getRequests()[0];
}

describe('ProxyServer', () => {
	it('streams the response through before the upstream has finished, and captures it', async () => {
		let release = () => {};
		const released = new Promise<void>((resolve) => {
			release = resolve;
		});
		let seenByUpstream: http.IncomingHttpHeaders = {};
		let urlSeenByUpstream = '';

		const upstream = await startUpstream(async (req, res) => {
			seenByUpstream = req.headers;
			urlSeenByUpstream = req.url ?? '';
			req.resume();
			res.writeHead(200, { 'content-type': 'text/event-stream' });
			res.write('data: one\n\n');
			await released;
			res.end('data: two\n\n');
		});
		const { base, store } = await startProxy(upstream);

		const res = await request(`${base}/fake/v1/messages?beta=true`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-api-key': 'sk-ant-test-1234567890abcd',
			},
			body: '{"stream":true}',
		});

		const first = await new Promise<string>((resolve) =>
			res.once('data', (chunk: Buffer) => resolve(chunk.toString())),
		);
		expect(first).toBe('data: one\n\n');
		expect(store.getRequests()).toHaveLength(0);

		release();
		expect((await readAll(res)).toString()).toBe('data: two\n\n');

		expect(urlSeenByUpstream).toBe('/v1/messages?beta=true');
		expect(seenByUpstream['x-api-key']).toBe('sk-ant-test-1234567890abcd');
		expect(seenByUpstream.host).toBe(new URL(upstream).host);

		const captured = await onlyCaptured(store);
		expect(captured).toMatchObject({
			provider: 'fake',
			host: new URL(upstream).host,
			method: 'POST',
			path: '/v1/messages?beta=true',
			body: '{"stream":true}',
			response: { status: 200, body: 'data: one\n\ndata: two\n\n' },
		});
		expect(captured.headers['x-api-key']).toBe('••••abcd');
		expect(captured.error).toBeUndefined();

		const { start, firstByte, end } = captured.timings;
		expect(firstByte).toBeGreaterThanOrEqual(start);
		expect(end).toBeGreaterThanOrEqual(firstByte ?? Number.NaN);
		expect(captured.latency).toBe((end ?? 0) - start);
	});

	it('forwards compressed bytes unchanged and captures the decompressed body', async () => {
		const payload = JSON.stringify({ content: 'héllo wörld ✓' });
		const gz = zlib.gzipSync(payload);

		const upstream = await startUpstream((_req, res) => {
			res.writeHead(200, {
				'content-type': 'application/json',
				'content-encoding': 'gzip',
				'content-length': gz.length,
			});
			res.end(gz);
		});
		const { base, store } = await startProxy(upstream);

		const res = await request(`${base}/fake/v1/messages`);
		expect(res.headers['content-encoding']).toBe('gzip');
		expect((await readAll(res)).equals(gz)).toBe(true);

		const captured = await onlyCaptured(store);
		expect(captured.response?.body).toBe(payload);
	});

	it('returns 502 and records the error when the upstream is unreachable', async () => {
		const closed = http.createServer();
		const deadUrl = await listen(closed);
		await new Promise<void>((resolve) => closed.close(() => resolve()));

		const { base, store } = await startProxy(deadUrl);

		const res = await request(`${base}/fake/v1/messages`);
		expect(res.statusCode).toBe(502);
		expect((await readAll(res)).toString()).toMatch(
			/LLMSpy could not reach/,
		);

		const captured = await onlyCaptured(store);
		expect(captured.error).toMatch(/Upstream request failed/);
		expect(captured.response).toBeUndefined();
	});

	it('opens /events straight away when there is nothing to replay', async () => {
		const { base } = await startProxy('http://127.0.0.1:1');

		const res = await request(`${base}/events`);
		res.destroy();
		expect(res.statusCode).toBe(200);
		expect(res.headers['content-type']).toBe('text/event-stream');
	});

	it('returns 404 for an unknown prefix without capturing it', async () => {
		const { base, store } = await startProxy('http://127.0.0.1:1');

		const res = await request(`${base}/nope/v1/messages`);
		expect(res.statusCode).toBe(404);
		expect((await readAll(res)).toString()).toMatch(
			/Known prefixes: \/fake/,
		);
		expect(store.getRequests()).toHaveLength(0);
	});
});
