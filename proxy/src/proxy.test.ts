import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as zlib from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProxyServer } from './proxy.js';
import { RequestStore } from './store.js';
import type { ProxyConfig } from './types.js';

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

async function startProxy(
	upstreamUrl: string,
	extra: Partial<ProxyConfig> = {},
) {
	const store = new RequestStore();
	const proxy = new ProxyServer(
		{
			port: 0,
			host: '127.0.0.1',
			upstreams: new Map([['fake', new URL(upstreamUrl)]]),
			version: '9.9.9-test',
			...extra,
		},
		store,
	);
	const port = await proxy.start();
	cleanups.push(async () => {
		await proxy.stop();
		store.close();
	});
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
		const running = await onlyCaptured(store);
		expect(running.response).toMatchObject({ status: 200, body: '' });
		expect(running.timings.end).toBeUndefined();
		expect(running.latency).toBeUndefined();

		release();
		expect((await readAll(res)).toString()).toBe('data: two\n\n');

		expect(urlSeenByUpstream).toBe('/v1/messages?beta=true');
		expect(seenByUpstream['x-api-key']).toBe('sk-ant-test-1234567890abcd');
		expect(seenByUpstream.host).toBe(new URL(upstream).host);

		const captured = await onlyCaptured(store);
		expect(captured).toMatchObject({
			project: 'general',
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

	it('records and broadcasts a call before the upstream answers, then replaces it when it ends', async () => {
		let release = () => {};
		const released = new Promise<void>((resolve) => {
			release = resolve;
		});
		const upstream = await startUpstream(async (req, res) => {
			req.resume();
			await released;
			res.end('{}');
		});
		const { base, store } = await startProxy(upstream);

		const events = await request(`${base}/events`);
		const received: string[] = [];
		events.on('data', (chunk: Buffer) => received.push(chunk.toString()));

		const res = request(`${base}/fake/v1/messages`, {
			method: 'POST',
			body: '{"model":"claude-test","messages":[]}',
		});

		const waiting = await onlyCaptured(store);
		expect(waiting.body).toBe('{"model":"claude-test","messages":[]}');
		expect(waiting.response).toBeUndefined();
		expect(waiting.timings.end).toBeUndefined();
		expect(waiting.llm?.model).toBe('claude-test');
		await vi.waitFor(() => expect(received.join('')).toContain(waiting.id));

		release();
		await readAll(await res);
		await vi.waitFor(() =>
			expect(store.getRequests()[0].timings.end).toBeDefined(),
		);
		expect(store.getRequests()).toHaveLength(1);
		expect(store.getRequests()[0]).toMatchObject({
			id: waiting.id,
			response: { status: 200, body: '{}' },
		});
		events.destroy();
	});

	it('reads a streamed reply while it arrives', async () => {
		let release = () => {};
		const released = new Promise<void>((resolve) => {
			release = resolve;
		});
		const event = (data: object) =>
			`event: ${(data as { type: string }).type}\ndata: ${JSON.stringify(data)}\n\n`;

		const upstream = await startUpstream(async (req, res) => {
			req.resume();
			res.writeHead(200, { 'content-type': 'text/event-stream' });
			res.write(
				event({
					type: 'message_start',
					message: { model: 'claude-test', usage: {} },
				}) +
					event({
						type: 'content_block_start',
						index: 0,
						content_block: { type: 'text', text: '' },
					}) +
					event({
						type: 'content_block_delta',
						index: 0,
						delta: { type: 'text_delta', text: 'Hel' },
					}),
			);
			await released;
			res.end(
				event({
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'text_delta', text: 'lo' },
				}) + event({ type: 'message_stop' }),
			);
		});
		const { base, store } = await startProxy(upstream);

		const res = await request(`${base}/fake/v1/messages`, {
			method: 'POST',
			body: '{"model":"claude-test","stream":true,"messages":[]}',
		});
		const ended = readAll(res);

		await vi.waitFor(() =>
			expect(store.getRequests()[0]?.llm?.output?.parts).toEqual([
				{ type: 'text', text: 'Hel' },
			]),
		);
		const running = store.getRequests()[0];
		expect(running.timings.end).toBeUndefined();
		expect(running.response?.body).toContain('Hel');
		const firstData = running.timings.lastData;
		expect(firstData).toBeGreaterThanOrEqual(
			running.timings.firstByte ?? 0,
		);

		release();
		await ended;
		await vi.waitFor(() =>
			expect(store.getRequests()[0].timings.end).toBeDefined(),
		);
		expect(store.getRequests()).toHaveLength(1);
		const { timings } = store.getRequests()[0];
		expect(timings.lastData).toBeGreaterThanOrEqual(firstData ?? 0);
		expect(timings.lastData).toBeLessThanOrEqual(timings.end ?? 0);
		expect(store.getRequests()[0].llm?.output?.parts).toEqual([
			{ type: 'text', text: 'Hello' },
		]);
	});

	it('records when stream data last arrived only for a live stream', async () => {
		const upstream = await startUpstream((req, res) => {
			req.resume();
			res.end('{}');
		});
		const { base, store } = await startProxy(upstream);
		await readAll(await request(`${base}/fake/v1/messages`));
		await vi.waitFor(() =>
			expect(store.getRequests()[0]?.timings.end).toBeDefined(),
		);
		const { timings } = store.getRequests()[0];
		expect(timings.firstByte).toBeDefined();
		expect(timings.lastData).toBeUndefined();
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

	it('reports its port, pid and version from /ping', async () => {
		const { base } = await startProxy('http://127.0.0.1:1');

		const res = await request(`${base}/ping`);
		const body = JSON.parse((await readAll(res)).toString());
		expect(body.port).toBe(Number(new URL(base).port));
		expect(body.pid).toBe(process.pid);
		expect(body.version).toBe('9.9.9-test');
	});

	it('serves llms.txt as plain text, to another site too', async () => {
		const { base } = await startProxy('http://127.0.0.1:1', {
			llmsTxt: '# LLMSpy ✓\n',
		});

		const res = await request(`${base}/llms.txt`, {
			headers: { origin: 'https://example.com' },
		});
		expect(res.statusCode).toBe(200);
		expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
		expect(res.headers['content-length']).toBe(
			String(Buffer.byteLength('# LLMSpy ✓\n')),
		);
		expect((await readAll(res)).toString()).toBe('# LLMSpy ✓\n');

		const head = await request(`${base}/llms.txt`, { method: 'HEAD' });
		expect(head.statusCode).toBe(200);
		expect((await readAll(head)).length).toBe(0);
	});

	it('answers 404 for llms.txt when it has none', async () => {
		const { base } = await startProxy('http://127.0.0.1:1');

		const res = await request(`${base}/llms.txt`);
		await readAll(res);
		expect(res.statusCode).toBe(404);
	});

	it('lists the upstreams at /api/upstreams', async () => {
		const { base } = await startProxy('http://127.0.0.1:1');

		const res = await request(`${base}/api/upstreams`);
		expect(res.headers['content-type']).toBe('application/json');
		expect(JSON.parse((await readAll(res)).toString())).toEqual([
			{ name: 'fake', target: 'http://127.0.0.1:1/' },
		]);
	});

	it('opens /events straight away when there is nothing to replay', async () => {
		const { base } = await startProxy('http://127.0.0.1:1');

		const res = await request(`${base}/events`);
		res.destroy();
		expect(res.statusCode).toBe(200);
		expect(res.headers['content-type']).toBe('text/event-stream');
	});

	it('tells every /events client when the records are cleared', async () => {
		const { base } = await startProxy('http://127.0.0.1:1');
		const clients = await Promise.all([
			request(`${base}/events`),
			request(`${base}/events`),
		]);
		const received = clients.map((client) => {
			const chunks: string[] = [];
			client.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
			return chunks;
		});

		const clear = await request(`${base}/api/clear`, { method: 'POST' });
		clear.resume();

		for (const chunks of received) {
			await vi.waitFor(() =>
				expect(chunks.join('')).toBe('event: clear\ndata: {}\n\n'),
			);
		}
		for (const client of clients) client.destroy();
	});

	it('records the project in front of the upstream and does not forward it', async () => {
		let urlSeenByUpstream = '';
		const upstream = await startUpstream((req, res) => {
			urlSeenByUpstream = req.url ?? '';
			req.resume();
			res.end('{}');
		});
		const { base, store } = await startProxy(upstream);

		await readAll(await request(`${base}/@my-app/fake/v1/messages?x=1`));

		expect(urlSeenByUpstream).toBe('/v1/messages?x=1');
		expect(await onlyCaptured(store)).toMatchObject({
			project: 'my-app',
			provider: 'fake',
			path: '/v1/messages?x=1',
		});
	});

	it('clears one project and tells every /events client which', async () => {
		const upstream = await startUpstream((req, res) => {
			req.resume();
			res.end('{}');
		});
		const { base, store } = await startProxy(upstream);
		await readAll(await request(`${base}/@my-app/fake/v1/messages`));
		await readAll(await request(`${base}/fake/v1/messages`));
		await vi.waitFor(() => expect(store.getRequests()).toHaveLength(2));

		const events = await request(`${base}/events`);
		const chunks: string[] = [];
		events.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
		// The two replayed records arrive first, maybe in one chunk.
		const replay = (): number => chunks.join('').split('\n\n').length - 1;
		await vi.waitFor(() => expect(replay()).toBe(2));
		const replayed = chunks.join('').length;

		const clear = await request(`${base}/api/clear?project=my-app`, {
			method: 'POST',
		});
		clear.resume();
		expect(clear.statusCode).toBe(200);
		expect(store.getRequests().map(({ project }) => project)).toEqual([
			'general',
		]);
		await vi.waitFor(() =>
			expect(chunks.join('').slice(replayed)).toBe(
				'event: clear\ndata: {"project":"my-app"}\n\n',
			),
		);
		events.destroy();
	});

	it('answers 400 to clearing a project name that cannot exist', async () => {
		const upstream = await startUpstream((req, res) => {
			req.resume();
			res.end('{}');
		});
		const { base, store } = await startProxy(upstream);
		await readAll(await request(`${base}/fake/v1/messages`));
		await onlyCaptured(store);

		const res = await request(`${base}/api/clear?project=Not_Valid`, {
			method: 'POST',
		});
		res.resume();
		expect(res.statusCode).toBe(400);
		expect(store.getRequests()).toHaveLength(1);
	});

	it('deletes one record and tells every /events client', async () => {
		const upstream = await startUpstream((req, res) => {
			req.resume();
			res.end('{}');
		});
		const { base, store } = await startProxy(upstream);
		await readAll(await request(`${base}/fake/v1/messages`));
		const { id } = await onlyCaptured(store);

		const events = await request(`${base}/events`);
		const chunks: string[] = [];
		events.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
		// The replayed record arrives first.
		await vi.waitFor(() => expect(chunks).toHaveLength(1));

		const res = await request(`${base}/api/requests/${id}`, {
			method: 'DELETE',
		});
		expect(res.statusCode).toBe(204);
		expect((await readAll(res)).length).toBe(0);
		expect(store.getRequests()).toHaveLength(0);
		await vi.waitFor(() =>
			expect(chunks.slice(1).join('')).toBe(
				`event: delete\ndata: {"id":"${id}"}\n\n`,
			),
		);
		events.destroy();
	});

	it('answers 404 to deleting a record it does not hold, and sends no event', async () => {
		const { base } = await startProxy('http://127.0.0.1:1');
		const events = await request(`${base}/events`);
		const chunks: string[] = [];
		events.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

		const res = await request(`${base}/api/requests/no-such-id`, {
			method: 'DELETE',
		});
		res.resume();
		expect(res.statusCode).toBe(404);
		expect(chunks).toEqual([]);
		events.destroy();
	});

	it('sends /events clients summaries, without headers or bodies', async () => {
		const upstream = await startUpstream((req, res) => {
			req.resume();
			res.end('{"secret":"reply"}');
		});
		const { base, store } = await startProxy(upstream);
		await readAll(
			await request(`${base}/fake/v1/messages`, {
				method: 'POST',
				body: '{"model":"claude-test","messages":[]}',
			}),
		);
		await vi.waitFor(() =>
			expect(store.getRequests()[0]?.timings.end).toBeDefined(),
		);

		const events = await request(`${base}/events`);
		const chunks: string[] = [];
		events.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
		await vi.waitFor(() => expect(chunks).toHaveLength(1));
		events.destroy();

		const replayed = JSON.parse(chunks[0].replace(/^data: /, ''));
		expect(replayed).toMatchObject({
			id: store.getRequests()[0].id,
			response: { status: 200 },
			llm: { model: 'claude-test' },
		});
		expect(replayed.headers).toBeUndefined();
		expect(replayed.body).toBeUndefined();
		expect(chunks[0]).not.toContain('secret');
	});

	describe('GET /api/requests', () => {
		async function proxyWithThreeCalls() {
			const upstream = await startUpstream((req, res) => {
				req.resume();
				res.end('{"reply":"Bonjour"}');
			});
			const { base, store } = await startProxy(upstream);
			const send = async (path: string, body: string) =>
				readAll(
					await request(`${base}${path}`, { method: 'POST', body }),
				);
			await send('/fake/v1/messages', '{"say":"hello"}');
			await send('/@my-app/fake/v1/messages', '{"say":"Hello there"}');
			await send('/@my-app/fake/v1/messages', '{"say":"goodbye"}');
			await vi.waitFor(() =>
				expect(
					store.getRequests().filter(({ timings }) => timings.end),
				).toHaveLength(3),
			);
			const list = async (query: string) => {
				const res = await request(`${base}/api/requests${query}`);
				return {
					status: res.statusCode,
					body: (await readAll(res)).toString(),
				};
			};
			return { store, list };
		}

		it('returns summaries of every record, newest first', async () => {
			const { store, list } = await proxyWithThreeCalls();
			const { status, body } = await list('');
			expect(status).toBe(200);
			const summaries = JSON.parse(body);
			expect(summaries.map(({ id }: { id: string }) => id)).toEqual(
				store.getRequests().map(({ id }) => id),
			);
			expect(summaries[0].body).toBeUndefined();
			expect(summaries[0].headers).toBeUndefined();
			expect(body).not.toContain('Bonjour');
		});

		it('keeps one project with ?project=', async () => {
			const { list } = await proxyWithThreeCalls();
			const summaries = JSON.parse((await list('?project=my-app')).body);
			expect(summaries).toHaveLength(2);
			expect(
				summaries.every(
					({ project }: { project: string }) => project === 'my-app',
				),
			).toBe(true);
		});

		it('searches both bodies with ?q=, ignoring case, and with ?project=', async () => {
			const { store, list } = await proxyWithThreeCalls();
			const ids = (body: string) =>
				JSON.parse(body).map(({ id }: { id: string }) => id);
			const byBody = (say: string) =>
				store.getRequests().find(({ body }) => body.includes(say))?.id;

			expect(ids((await list('?q=HELLO')).body)).toEqual([
				byBody('Hello there'),
				byBody('"hello"'),
			]);
			expect(ids((await list('?q=hello&project=my-app')).body)).toEqual([
				byBody('Hello there'),
			]);
			expect(ids((await list('?q=bonjour')).body)).toHaveLength(3);
			expect(ids((await list('?q=nowhere')).body)).toEqual([]);
		});

		it('keeps the calls that started at or after ?since=, as ISO time or ms', async () => {
			const { store, list } = await proxyWithThreeCalls();
			const ids = (body: string) =>
				JSON.parse(body).map(({ id }: { id: string }) => id);
			const since = store.getRequests()[1].timings.start;
			const expected = store
				.getRequests()
				.filter(({ timings }) => timings.start >= since)
				.map(({ id }) => id);

			expect(ids((await list(`?since=${since}`)).body)).toEqual(expected);
			const iso = new Date(since).toISOString();
			expect(ids((await list(`?since=${iso}`)).body)).toEqual(expected);
		});

		it('returns the newest full records with ?full=1&limit=', async () => {
			const { store, list } = await proxyWithThreeCalls();
			const { status, body } = await list('?full=1&limit=2');
			expect(status).toBe(200);
			const records = JSON.parse(body);
			expect(records).toEqual(store.getRequests().slice(0, 2));
			expect(records[0].response.body).toBe('{"reply":"Bonjour"}');
		});

		it('keeps the failed calls with ?failed=1, and one status with ?status=', async () => {
			const upstream = await startUpstream((req, res) => {
				req.resume();
				res.statusCode = req.url?.includes('limited') ? 429 : 200;
				res.end('{}');
			});
			const { base, store } = await startProxy(upstream);
			for (const path of ['/fake/ok', '/fake/limited', '/fake/ok']) {
				await readAll(
					await request(`${base}${path}`, { method: 'POST' }),
				);
			}
			await vi.waitFor(() =>
				expect(
					store.getRequests().filter(({ timings }) => timings.end),
				).toHaveLength(3),
			);
			const paths = async (query: string) =>
				JSON.parse(
					(
						await readAll(
							await request(`${base}/api/requests${query}`),
						)
					).toString(),
				).map(({ path }: { path: string }) => path);

			expect(await paths('?failed=1')).toEqual(['/limited']);
			expect(await paths('?status=4xx')).toEqual(['/limited']);
			expect(await paths('?status=200&limit=1')).toEqual(['/ok']);
		});

		it('answers 400 to a parameter it can not read', async () => {
			const { list } = await proxyWithThreeCalls();
			for (const query of [
				'?project=Not_Valid',
				'?since=yesterday',
				'?limit=0',
				'?full=true',
				'?status=4x',
				'?failed=0',
				'?model=',
			]) {
				const { status, body } = await list(query);
				expect(status).toBe(400);
				expect(body).toMatch(/^LLMSpy: /);
			}
		});
	});

	describe('/api/stats', () => {
		it('counts the calls the filters match, per project too', async () => {
			const upstream = await startUpstream((req, res) => {
				req.resume();
				res.statusCode = req.url?.includes('limited') ? 429 : 200;
				res.end('{}');
			});
			const { base, store } = await startProxy(upstream);
			for (const path of [
				'/fake/ok',
				'/@my-app/fake/limited',
				'/@my-app/fake/ok',
			]) {
				await readAll(
					await request(`${base}${path}`, { method: 'POST' }),
				);
			}
			await vi.waitFor(() =>
				expect(
					store.getRequests().filter(({ timings }) => timings.end),
				).toHaveLength(3),
			);
			const stats = async (query: string) => {
				const res = await request(`${base}/api/stats${query}`);
				return {
					status: res.statusCode,
					body: (await readAll(res)).toString(),
				};
			};

			const all = JSON.parse((await stats('')).body);
			expect(all).toMatchObject({ calls: 3, running: 0, failed: 1 });
			expect(all.byModel.none.calls).toBe(3);
			expect(all.byProject.general.calls).toBe(1);
			expect(all.byProject['my-app']).toMatchObject({
				calls: 2,
				failed: 1,
			});
			expect(all.latencyMs.max).toBeGreaterThanOrEqual(all.latencyMs.p50);

			const mine = JSON.parse(
				(await stats('?project=my-app&failed=1')).body,
			);
			expect(mine).toMatchObject({ calls: 1, failed: 1 });
			expect(Object.keys(mine.byProject)).toEqual(['my-app']);
		});

		it('answers 400 to limit, full and a filter it can not read', async () => {
			const { base } = await startProxy(
				await startUpstream((_req, res) => res.end()),
			);
			for (const query of ['?limit=5', '?full=1', '?status=4x']) {
				const res = await request(`${base}/api/stats${query}`);
				expect(res.statusCode).toBe(400);
				expect((await readAll(res)).toString()).toMatch(/^LLMSpy: /);
			}
		});
	});

	it('returns one full record from /api/requests/<id>', async () => {
		const upstream = await startUpstream((req, res) => {
			req.resume();
			res.end('{"reply":"Bonjour"}');
		});
		const { base, store } = await startProxy(upstream);
		await readAll(
			await request(`${base}/fake/v1/messages`, {
				method: 'POST',
				body: '{"say":"hello"}',
			}),
		);
		await vi.waitFor(() =>
			expect(store.getRequests()[0]?.timings.end).toBeDefined(),
		);
		const [captured] = store.getRequests();

		const res = await request(`${base}/api/requests/${captured.id}`);
		expect(res.statusCode).toBe(200);
		expect(res.headers['content-type']).toBe('application/json');
		expect(JSON.parse((await readAll(res)).toString())).toEqual(
			JSON.parse(JSON.stringify(captured)),
		);
	});

	it('answers 404 to reading a record it does not hold', async () => {
		const { base } = await startProxy('http://127.0.0.1:1');

		const res = await request(`${base}/api/requests/no-such-id`);
		expect(res.statusCode).toBe(404);
		expect((await readAll(res)).toString()).toMatch(/no captured call/);
	});

	it('returns a call as Markdown from /api/requests/<id>/conversation', async () => {
		const upstream = await startUpstream((req, res) => {
			req.resume();
			res.setHeader('content-type', 'application/json');
			res.end(
				'{"model":"claude-test","content":[{"type":"text","text":"Bonjour"}],"stop_reason":"end_turn"}',
			);
		});
		const { base, store } = await startProxy(upstream);
		await readAll(
			await request(`${base}/fake/v1/messages`, {
				method: 'POST',
				body: '{"model":"claude-test","messages":[{"role":"user","content":"Hello"}]}',
			}),
		);
		await vi.waitFor(() =>
			expect(store.getRequests()[0]?.timings.end).toBeDefined(),
		);
		const [{ id }] = store.getRequests();

		const res = await request(`${base}/api/requests/${id}/conversation`);
		expect(res.statusCode).toBe(200);
		expect(res.headers['content-type']).toBe(
			'text/markdown; charset=utf-8',
		);
		const text = (await readAll(res)).toString();
		expect(text).toMatch(/^# claude-test · anthropic-messages\n/);
		expect(text).toContain(
			'## User\n\nHello\n\n## Assistant (reply)\n\nBonjour\n',
		);
	});

	it('answers 404 with a pointer to the record for a call that is not an LLM call', async () => {
		const upstream = await startUpstream((req, res) => {
			req.resume();
			res.end('{}');
		});
		const { base, store } = await startProxy(upstream);
		await readAll(await request(`${base}/fake/other`));
		await vi.waitFor(() =>
			expect(store.getRequests()[0]?.timings.end).toBeDefined(),
		);
		const [{ id }] = store.getRequests();

		const res = await request(`${base}/api/requests/${id}/conversation`);
		expect(res.statusCode).toBe(404);
		expect((await readAll(res)).toString()).toContain(
			`/api/requests/${id}.`,
		);

		const missing = await request(
			`${base}/api/requests/no-such-id/conversation`,
		);
		expect(missing.statusCode).toBe(404);
		expect((await readAll(missing)).toString()).toMatch(/no captured call/);
	});

	describe('?wait= on one call', () => {
		const REPLY =
			'{"model":"claude-test","content":[{"type":"text","text":"Bonjour"}],"stop_reason":"end_turn"}';

		/** A proxy holding one call whose upstream answers on `release()`. */
		async function proxyWithRunningCall() {
			let release = () => {};
			const released = new Promise<void>((resolve) => {
				release = resolve;
			});
			const upstream = await startUpstream(async (req, res) => {
				req.resume();
				await released;
				res.setHeader('content-type', 'application/json');
				res.end(REPLY);
			});
			const { base, store } = await startProxy(upstream);
			const call = request(`${base}/fake/v1/messages`, {
				method: 'POST',
				body: '{"model":"claude-test","messages":[{"role":"user","content":"Hello"}]}',
			});
			const { id } = await onlyCaptured(store);
			const finish = async () => {
				release();
				await readAll(await call);
			};
			return { base, id, finish };
		}

		/** Whether `answer` is still unanswered after a short while. */
		async function stillWaiting(
			answer: Promise<unknown>,
		): Promise<boolean> {
			const pause = new Promise((resolve) =>
				setTimeout(() => resolve('waiting'), 200),
			);
			return (await Promise.race([answer, pause])) === 'waiting';
		}

		it('answers both routes when the call ends', async () => {
			const { base, id, finish } = await proxyWithRunningCall();

			const record = request(`${base}/api/requests/${id}?wait=5`);
			const markdown = request(
				`${base}/api/requests/${id}/conversation?wait=5`,
			);
			expect(await stillWaiting(record)).toBe(true);
			expect(await stillWaiting(markdown)).toBe(true);

			await finish();
			const recordRes = await record;
			expect(recordRes.statusCode).toBe(200);
			const captured = JSON.parse((await readAll(recordRes)).toString());
			expect(captured.timings.end).toBeDefined();
			expect(captured.response.body).toBe(REPLY);

			const markdownRes = await markdown;
			expect(markdownRes.statusCode).toBe(200);
			expect((await readAll(markdownRes)).toString()).toContain(
				'## Assistant (reply)\n\nBonjour\n',
			);
		});

		it('answers with the call so far when the wait runs out', async () => {
			const { base, id, finish } = await proxyWithRunningCall();

			const started = Date.now();
			const [recordRes, markdownRes] = await Promise.all([
				request(`${base}/api/requests/${id}?wait=1`),
				request(`${base}/api/requests/${id}/conversation?wait=1`),
			]);
			expect(Date.now() - started).toBeGreaterThanOrEqual(950);

			expect(recordRes.statusCode).toBe(200);
			const captured = JSON.parse((await readAll(recordRes)).toString());
			expect(captured.id).toBe(id);
			expect(captured.timings.end).toBeUndefined();

			expect(markdownRes.statusCode).toBe(200);
			expect((await readAll(markdownRes)).toString()).toContain(
				'running',
			);
			await finish();
		});

		it('answers 404 when the call is deleted while waiting', async () => {
			const { base, id, finish } = await proxyWithRunningCall();

			const record = request(`${base}/api/requests/${id}?wait=5`);
			expect(await stillWaiting(record)).toBe(true);
			await readAll(
				await request(`${base}/api/requests/${id}`, {
					method: 'DELETE',
				}),
			);

			const res = await record;
			expect(res.statusCode).toBe(404);
			expect((await readAll(res)).toString()).toMatch(/no captured call/);
			await finish();
		});

		it('answers 404 when the call is cleared while waiting', async () => {
			const { base, id, finish } = await proxyWithRunningCall();

			const markdown = request(
				`${base}/api/requests/${id}/conversation?wait=5`,
			);
			expect(await stillWaiting(markdown)).toBe(true);
			await readAll(
				await request(`${base}/api/clear`, { method: 'POST' }),
			);

			const res = await markdown;
			expect(res.statusCode).toBe(404);
			await readAll(res);
			await finish();
		});

		it('answers at once for a call that ended or is unknown, and 400 to a bad wait', async () => {
			const upstream = await startUpstream((req, res) => {
				req.resume();
				res.end('{}');
			});
			const { base, store } = await startProxy(upstream);
			await readAll(await request(`${base}/fake/v1/messages`));
			await vi.waitFor(() =>
				expect(store.getRequests()[0]?.timings.end).toBeDefined(),
			);
			const [{ id }] = store.getRequests();

			const started = Date.now();
			const ended = await request(`${base}/api/requests/${id}?wait=300`);
			expect(ended.statusCode).toBe(200);
			await readAll(ended);
			const unknown = await request(
				`${base}/api/requests/no-such-id?wait=300`,
			);
			expect(unknown.statusCode).toBe(404);
			await readAll(unknown);
			expect(Date.now() - started).toBeLessThan(1000);

			const bad = await request(`${base}/api/requests/${id}?wait=yes`);
			expect(bad.statusCode).toBe(400);
			expect((await readAll(bad)).toString()).toMatch(/wait must be/);
		});
	});

	it('ignores a query string on the UI routes', async () => {
		const upstream = await startUpstream((req, res) => {
			req.resume();
			res.end('{}');
		});
		const { base, store } = await startProxy(upstream);
		await readAll(await request(`${base}/fake/v1/messages`));
		await onlyCaptured(store);

		const requests = await request(`${base}/api/requests?limit=1`);
		expect(requests.statusCode).toBe(200);
		expect(JSON.parse((await readAll(requests)).toString())).toHaveLength(
			1,
		);

		const ping = await request(`${base}/ping?x=1`);
		expect(JSON.parse((await readAll(ping)).toString()).status).toBe(
			'running',
		);

		const upstreams = await request(`${base}/api/upstreams?x=1`);
		expect(JSON.parse((await readAll(upstreams)).toString())).toHaveLength(
			1,
		);

		const events = await request(`${base}/events?x=1`);
		events.destroy();
		expect(events.headers['content-type']).toBe('text/event-stream');

		const clear = await request(`${base}/api/clear?x=1`, {
			method: 'POST',
		});
		clear.resume();
		expect(clear.statusCode).toBe(200);
		expect(store.getRequests()).toHaveLength(0);
	});

	it('does not answer a UI route with a trailing slash', async () => {
		const { base } = await startProxy('http://127.0.0.1:1');

		const res = await request(`${base}/api/requests/`);
		res.resume();
		expect(res.statusCode).toBe(404);
	});

	it('refuses the UI API with a query string from a rebound host name', async () => {
		const { base } = await startProxy('http://127.0.0.1:1');

		const res = await request(`${base}/api/requests?limit=1`, {
			headers: { host: 'evil.example:8080' },
		});
		res.resume();
		expect(res.statusCode).toBe(403);
	});

	it.each([
		['GET', '/api/requests'],
		['GET', '/api/requests/some-id'],
		['POST', '/api/clear'],
		['DELETE', '/api/requests/some-id'],
		['GET', '/events'],
		['GET', '/ping'],
	])('refuses %s %s from another site', async (method, path) => {
		const { base } = await startProxy('http://127.0.0.1:1');

		const res = await request(`${base}${path}`, {
			method,
			headers: { origin: 'http://evil.example' },
		});
		res.resume();
		expect(res.statusCode).toBe(403);
	});

	it('refuses the UI API under a rebound host name, and leaves the store alone', async () => {
		const upstream = await startUpstream((req, res) => {
			req.resume();
			res.end('{}');
		});
		const { base, store } = await startProxy(upstream);
		await readAll(await request(`${base}/fake/v1/messages`));
		await onlyCaptured(store);

		const res = await request(`${base}/api/clear`, {
			method: 'POST',
			headers: { host: 'evil.example:8080' },
		});
		res.resume();
		expect(res.statusCode).toBe(403);
		expect(store.getRequests()).toHaveLength(1);
	});

	it('allows the UI API from its own origin', async () => {
		const { base } = await startProxy('http://127.0.0.1:1');

		const res = await request(`${base}/api/clear`, {
			method: 'POST',
			headers: { origin: base },
		});
		res.resume();
		expect(res.statusCode).toBe(200);
	});

	it('forwards upstream traffic whatever the host name', async () => {
		const upstream = await startUpstream((req, res) => {
			req.resume();
			res.end('{}');
		});
		const { base, store } = await startProxy(upstream);

		const res = await request(`${base}/fake/v1/messages`, {
			headers: { host: 'llmspy:8080' },
		});
		await readAll(res);
		expect(res.statusCode).toBe(200);
		await onlyCaptured(store);
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
