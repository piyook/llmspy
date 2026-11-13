import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { forwardAndCapture } from './capture.js';
import type { RequestStore } from './store.js';
import type { CapturedRequest, ProxyConfig } from './types.js';
import { resolveRoute } from './upstreams.js';

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

		if (url === '/ping') {
			this.handlePing(res);
			return;
		}
		if (url === '/events') {
			this.handleSSE(req, res);
			return;
		}
		if (url === '/api/requests') {
			this.handleGetRequests(res);
			return;
		}
		if (url === '/api/clear' && req.method === 'POST') {
			this.handleClearRequests(res);
			return;
		}

		const route = resolveRoute(url, this.config.upstreams);
		if (!route) {
			const prefixes = [...this.config.upstreams.keys()]
				.map((name) => `/${name}`)
				.join(', ');
			res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
			res.end(
				`LLMSpy: no upstream for ${url}. Known prefixes: ${prefixes}`,
			);
			return;
		}

		forwardAndCapture(
			req,
			res,
			route.provider,
			route.target,
			(captured) => {
				this.store.addRequest(captured);
				this.broadcast(captured);
			},
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
			'Access-Control-Allow-Origin': '*',
		});

		this.sseClients.add(res);
		req.on('close', () => {
			this.sseClients.delete(res);
		});

		for (const captured of this.store.getRequests()) {
			res.write(`data: ${JSON.stringify(captured)}\n\n`);
		}
	}

	private handleGetRequests(res: http.ServerResponse): void {
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
		});
		res.end(JSON.stringify(this.store.getRequests()));
	}

	private handlePing(res: http.ServerResponse): void {
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
		});
		res.end(
			JSON.stringify({
				status: 'running',
				message: 'LLMSpy proxy server is running',
				timestamp: new Date().toISOString(),
			}),
		);
	}

	private handleClearRequests(res: http.ServerResponse): void {
		this.store.clear();
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
		});
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
