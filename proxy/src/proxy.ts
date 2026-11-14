import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { forwardAndCapture } from './capture.js';
import { isAllowedUiRequest } from './guard.js';
import { parseExchange } from './parsers/index.js';
import { serveStatic } from './static.js';
import type { RequestStore } from './store.js';
import type { CapturedRequest, ProxyConfig } from './types.js';
import { listUpstreams, resolveRoute } from './upstreams.js';

/**
 * The routes that serve captured traffic or act on it. Upstream forwarding is
 * not guarded: apps in other containers reach it by other host names.
 */
function isUiRoute(path: string): boolean {
	return path === '/ping' || path === '/events' || path.startsWith('/api/');
}

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
		// The UI routes take no parameters, so a query string is ignored. The
		// full URL still goes to `resolveRoute`, so upstreams get their query.
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
			this.handleGetRequests(res);
			return;
		}
		if (path === '/api/upstreams') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(listUpstreams(this.config.upstreams)));
			return;
		}
		if (path === '/api/clear' && req.method === 'POST') {
			this.handleClearRequests(res);
			return;
		}

		const route = resolveRoute(url, this.config.upstreams);
		if (!route) {
			this.handleStaticOrNotFound(req, res);
			return;
		}

		forwardAndCapture(
			req,
			res,
			route.provider,
			route.target,
			(captured) => {
				const llm = parseExchange(captured);
				if (llm) captured.llm = llm;
				this.store.addRequest(captured);
				this.broadcast(captured);
			},
		);
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
			`LLMSpy: no upstream for ${req.url}. Known prefixes: ${prefixes}`,
		);
	}

	private broadcast(captured: CapturedRequest): void {
		const data = `data: ${JSON.stringify(captured)}\n\n`;
		for (const client of this.sseClients) {
			client.write(data);
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

		for (const captured of this.store.getRequests()) {
			res.write(`data: ${JSON.stringify(captured)}\n\n`);
		}
	}

	private handleGetRequests(res: http.ServerResponse): void {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(this.store.getRequests()));
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

	private handleClearRequests(res: http.ServerResponse): void {
		this.store.clear();
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ success: true }));
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
