import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { forwardAndCapture } from './capture.js';
import { isAllowedUiRequest } from './guard.js';
import { exchangeParser } from './parsers/index.js';
import { serveStatic } from './static.js';
import type { RequestStore } from './store.js';
import { toSummary } from './summary.js';
import type { CapturedRequest, ProxyConfig } from './types.js';
import { isProjectName, listUpstreams, resolveRoute } from './upstreams.js';

/**
 * The routes that serve captured traffic or act on it. Upstream forwarding is
 * not guarded: apps in other containers reach it by other host names.
 */
function isUiRoute(path: string): boolean {
	return path === '/ping' || path === '/events' || path.startsWith('/api/');
}

/** `/api/requests/<id>`: ids are UUIDs, so no decoding is needed. */
const RECORD_PATH = /^\/api\/requests\/([\w-]+)$/;

/**
 * One HTTP server for both jobs: `/<upstream>/...` is forwarded and captured,
 * and `/ping`, `/events` and `/api/*` serve the UI.
 */
export class ProxyServer {
	private readonly server: http.Server;
	private readonly config: ProxyConfig;
	private readonly store: RequestStore;
	private readonly sseClients = new Set<http.ServerResponse>();

	constructor(config: ProxyConfig, store: RequestStore) {
		this.config = config;
		this.store = store;
		this.server = http.createServer((req, res) =>
			this.handleRequest(req, res),
		);
	}

	private handleRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse,
	): void {
		const url = req.url ?? '/';
		// The UI routes match on the path alone; the few that take parameters
		// read the query themselves. The full URL still goes to `resolveRoute`,
		// so upstreams get their query.
		const path = url.split('?')[0];

		if (
			isUiRoute(path) &&
			!isAllowedUiRequest(req.headers, this.config.host)
		) {
			res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
			res.end('LLMSpy: the UI API only answers the UI on this machine.');
			return;
		}

		if (path === '/ping') {
			this.handlePing(res);
			return;
		}
		if (path === '/events') {
			this.handleSSE(req, res);
			return;
		}
		if (path === '/api/requests') {
			this.handleGetRequests(res, url);
			return;
		}
		if (path === '/api/upstreams') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(listUpstreams(this.config.upstreams)));
			return;
		}
		if (path === '/api/clear' && req.method === 'POST') {
			this.handleClearRequests(res, url);
			return;
		}
		const record = RECORD_PATH.exec(path);
		if (record && req.method === 'GET') {
			this.handleGetRequest(res, record[1]);
			return;
		}
		if (record && req.method === 'DELETE') {
			this.handleDeleteRequest(res, record[1]);
			return;
		}

		const route = resolveRoute(url, this.config.upstreams);
		if (!route) {
			this.handleStaticOrNotFound(req, res);
			return;
		}

		const parse = exchangeParser();
		const parseAndPublish = (captured: CapturedRequest): void => {
			const llm = parse(captured);
			if (llm) captured.llm = llm;
			this.publish(captured);
		};
		forwardAndCapture(req, res, route, {
			onUpdate: (captured) => {
				// When the response headers arrive the reply body is still
				// empty, and parsing it would report an error.
				if (captured.response?.body === '') this.publish(captured);
				else parseAndPublish(captured);
			},
			onDone: parseAndPublish,
		});
	}

	private publish(captured: CapturedRequest): void {
		this.store.addRequest(captured);
		this.broadcast(captured);
	}

	private async handleStaticOrNotFound(
		req: http.IncomingMessage,
		res: http.ServerResponse,
	): Promise<void> {
		const { uiDir } = this.config;
		if (uiDir && (await serveStatic(req, res, uiDir))) return;

		const prefixes = [...this.config.upstreams.keys()]
			.map((name) => `/${name}`)
			.join(', ');
		res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
		res.end(
			`LLMSpy: no upstream for ${req.url}. Known prefixes: ${prefixes} (put /@<project> in front to tag a project).`,
		);
	}

	/** Clients are sent the summary; they fetch the full record when they need it. */
	private broadcast(captured: CapturedRequest): void {
		this.sendToClients(`data: ${JSON.stringify(toSummary(captured))}\n\n`);
	}

	private sendToClients(event: string): void {
		for (const client of this.sseClients) {
			client.write(event);
		}
	}

	private handleSSE(
		req: http.IncomingMessage,
		res: http.ServerResponse,
	): void {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		});
		// Node holds the headers back until the first write, and with an empty
		// store there is nothing to replay, so the browser would never see the
		// stream open.
		res.flushHeaders();

		this.sseClients.add(res);
		req.on('close', () => {
			this.sseClients.delete(res);
		});

		for (const summary of this.store.summaries()) {
			res.write(`data: ${JSON.stringify(summary)}\n\n`);
		}
	}

	/**
	 * `GET /api/requests`: summaries, newest first. `?project=<name>` keeps
	 * one project's; `?q=<text>` keeps those whose host, path or either body
	 * holds the text, ignoring case.
	 */
	private handleGetRequests(res: http.ServerResponse, url: string): void {
		const query = new URLSearchParams(url.split('?')[1]);
		const project = query.get('project') ?? undefined;
		if (project !== undefined && !isProjectName(project)) {
			res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
			res.end(`LLMSpy: "${project}" is not a project name.`);
			return;
		}
		const summaries = this.store.summaries(project, query.get('q') ?? '');
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(summaries));
	}

	/** `GET /api/requests/<id>`: the full record. */
	private handleGetRequest(res: http.ServerResponse, id: string): void {
		const captured = this.store.get(id);
		if (!captured) {
			this.noSuchCall(res, id);
			return;
		}
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(captured));
	}

	private noSuchCall(res: http.ServerResponse, id: string): void {
		res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
		res.end(`LLMSpy: no captured call ${id}.`);
	}

	private handlePing(res: http.ServerResponse): void {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(
			JSON.stringify({
				status: 'running',
				message: 'LLMSpy proxy server is running',
				// The port really bound, so the UI can show it even when it is
				// served from elsewhere (Vite in dev).
				port: (this.server.address() as AddressInfo).port,
				// So `npm run stop` can check the pid file names this process.
				pid: process.pid,
				timestamp: new Date().toISOString(),
			}),
		);
	}

	/** `POST /api/clear?project=<name>` clears one project; without it, all. */
	private handleClearRequests(res: http.ServerResponse, url: string): void {
		const project =
			new URLSearchParams(url.split('?')[1]).get('project') ?? undefined;
		if (project !== undefined && !isProjectName(project)) {
			res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
			res.end(`LLMSpy: "${project}" is not a project name.`);
			return;
		}
		this.store.clear(project);
		// Named, so a client that only reads records (`onmessage`) ignores it.
		// No `project` means every project was cleared.
		this.sendToClients(
			`event: clear\ndata: ${JSON.stringify({ project })}\n\n`,
		);
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ success: true }));
	}

	private handleDeleteRequest(res: http.ServerResponse, id: string): void {
		if (!this.store.remove(id)) {
			this.noSuchCall(res, id);
			return;
		}
		// Named like `clear`, so every tab drops the row.
		this.sendToClients(
			`event: delete\ndata: ${JSON.stringify({ id })}\n\n`,
		);
		res.writeHead(204);
		res.end();
	}

	/** Starts listening and resolves with the port (useful when `port` is 0). */
	public start(): Promise<number> {
		return new Promise((resolve, reject) => {
			this.server.once('error', reject);
			this.server.listen(this.config.port, this.config.host, () => {
				this.server.off('error', reject);
				resolve((this.server.address() as AddressInfo).port);
			});
		});
	}

	public stop(): Promise<void> {
		for (const client of this.sseClients) client.end();
		this.sseClients.clear();
		return new Promise((resolve) => {
			this.server.close(() => resolve());
			this.server.closeAllConnections();
		});
	}
}
