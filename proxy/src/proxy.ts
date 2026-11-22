import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { pipeline, Readable } from 'node:stream';
import { forwardAndCapture } from './capture.js';
import { toMarkdown } from './conversation.js';
import { captureFile, captureFileName } from './export.js';
import { isAllowedUiRequest } from './guard.js';
import { exchangeParser } from './parsers/index.js';
import {
	parseExportRequest,
	parseListRequest,
	parseStatsRequest,
	parseWait,
} from './query.js';
import { serveStatic } from './static.js';
import { toStats } from './stats.js';
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
/** `/api/requests/<id>/conversation`: the call as Markdown. */
const CONVERSATION_PATH = /^\/api\/requests\/([\w-]+)\/conversation$/;

/**
 * One HTTP server for both jobs: `/<upstream>/...` is forwarded and captured,
 * and `/ping`, `/events` and `/api/*` serve the UI.
 */
export class ProxyServer {
	private readonly server: http.Server;
	private readonly config: ProxyConfig;
	private readonly store: RequestStore;
	private readonly sseClients = new Set<http.ServerResponse>();
	/** Reads held by `?wait=` until their call ends, by call id: each answers once. */
	private readonly waiting = new Map<string, Set<() => void>>();

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
		if (
			path === '/llms.txt' &&
			this.config.llmsTxt !== undefined &&
			(req.method === 'GET' || req.method === 'HEAD')
		) {
			this.handleLlmsTxt(req, res, this.config.llmsTxt);
			return;
		}
		if (path === '/events') {
			this.handleSSE(req, res);
			return;
		}
		if (this.handleReadRoute(res, url, path)) return;
		if (path === '/api/clear' && req.method === 'POST') {
			this.handleClearRequests(res, url);
			return;
		}
		if (this.handleRecordRoute(req, res, url, path)) return;

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

	/** The `/api/*` routes that read many calls or the settings; false when `path` is none of them. */
	private handleReadRoute(
		res: http.ServerResponse,
		url: string,
		path: string,
	): boolean {
		switch (path) {
			case '/api/requests':
				this.handleGetRequests(res, url);
				return true;
			case '/api/stats':
				this.handleGetStats(res, url);
				return true;
			case '/api/export':
				this.handleExport(res, url);
				return true;
			case '/api/upstreams':
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(listUpstreams(this.config.upstreams)));
				return true;
			default:
				return false;
		}
	}

	/** The routes on one call, `/api/requests/<id>...`; false when `path` is none of them. */
	private handleRecordRoute(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		url: string,
		path: string,
	): boolean {
		const record = RECORD_PATH.exec(path);
		if (record && req.method === 'DELETE') {
			this.handleDeleteRequest(res, record[1]);
			return true;
		}
		if (req.method !== 'GET') return false;
		if (record) {
			const id = record[1];
			this.handleRead(res, url, id, () => this.handleGetRequest(res, id));
			return true;
		}
		const conversation = CONVERSATION_PATH.exec(path);
		if (conversation) {
			const id = conversation[1];
			this.handleRead(res, url, id, () =>
				this.handleGetConversation(res, id),
			);
			return true;
		}
		return false;
	}

	/**
	 * Answers a read of one call with `answer`: at once, or with `?wait=` once
	 * a running call ends. A call that ended, or is unknown, is answered at once.
	 */
	private handleRead(
		res: http.ServerResponse,
		url: string,
		id: string,
		answer: () => void,
	): void {
		const asked = parseWait(new URLSearchParams(url.split('?')[1]));
		if ('error' in asked) {
			this.badRequest(res, asked.error);
			return;
		}
		const captured = this.store.get(id);
		if (
			asked.seconds === undefined ||
			captured === undefined ||
			captured.timings.end !== undefined
		) {
			answer();
			return;
		}
		this.holdUntilEnded(res, id, asked.seconds, answer);
	}

	/**
	 * Holds `answer` until `wake(id)` or `seconds` run out, when it answers
	 * with the call as it is then. A client that hangs up is forgotten.
	 */
	private holdUntilEnded(
		res: http.ServerResponse,
		id: string,
		seconds: number,
		answer: () => void,
	): void {
		const waiters = this.waiting.get(id) ?? new Set<() => void>();
		this.waiting.set(id, waiters);
		const forget = (): void => {
			clearTimeout(timer);
			res.off('close', forget);
			waiters.delete(release);
			if (waiters.size === 0) this.waiting.delete(id);
		};
		const release = (): void => {
			forget();
			answer();
		};
		const timer = setTimeout(release, seconds * 1000);
		res.on('close', forget);
		waiters.add(release);
	}

	/** Answers every read waiting on call `id`, with the call as it is now. */
	private wake(id: string): void {
		for (const release of [...(this.waiting.get(id) ?? [])]) release();
	}

	private publish(captured: CapturedRequest): void {
		this.store.addRequest(captured);
		this.broadcast(captured);
		if (captured.timings.end !== undefined) this.wake(captured.id);
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
	 * `GET /api/requests`: summaries, newest first, or full records with
	 * `full=1`; `parseListRequest` reads the filters.
	 */
	private handleGetRequests(res: http.ServerResponse, url: string): void {
		const asked = parseListRequest(new URLSearchParams(url.split('?')[1]));
		if ('error' in asked) {
			this.badRequest(res, asked.error);
			return;
		}
		const calls = asked.full
			? this.store.getRequests(asked.query)
			: this.store.summaries(asked.query);
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(calls));
	}

	/** `GET /api/stats`: counts over the calls the filters of `GET /api/requests` match. */
	private handleGetStats(res: http.ServerResponse, url: string): void {
		const asked = parseStatsRequest(new URLSearchParams(url.split('?')[1]));
		if ('error' in asked) {
			this.badRequest(res, asked.error);
			return;
		}
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(toStats(this.store.summaries(asked.query))));
	}

	/**
	 * `GET /api/export`: the finished calls the filters of `GET /api/requests`
	 * match, oldest first, as an `llm-capture` file to save. Each call is read
	 * from the store only when the response is ready for it.
	 */
	private handleExport(res: http.ServerResponse, url: string): void {
		const asked = parseExportRequest(
			new URLSearchParams(url.split('?')[1]),
		);
		if ('error' in asked) {
			this.badRequest(res, asked.error);
			return;
		}
		const now = new Date();
		const ids = this.store
			.summaries(asked.query)
			.map(({ id }) => id)
			.reverse();
		const store = this.store;
		function* calls(): Generator<CapturedRequest> {
			for (const id of ids) {
				const captured = store.get(id);
				if (captured) yield captured;
			}
		}
		res.writeHead(200, {
			'Content-Type': 'application/json; charset=utf-8',
			'Content-Disposition': `attachment; filename="${captureFileName(asked.query.project, now)}"`,
		});
		// pipeline stops reading the store if the client hangs up part-way.
		pipeline(
			Readable.from(
				captureFile(calls(), {
					createdAt: now,
					createdBy: `llmspy ${this.config.version}`,
					upstreams: this.config.upstreams,
				}),
			),
			res,
			() => {},
		);
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

	/** `GET /api/requests/<id>/conversation`: the call as Markdown. */
	private handleGetConversation(res: http.ServerResponse, id: string): void {
		const captured = this.store.get(id);
		if (!captured) {
			this.noSuchCall(res, id);
			return;
		}
		const markdown = toMarkdown(captured);
		if (markdown === undefined) {
			res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
			res.end(
				`LLMSpy: call ${id} was not read as an LLM API call; the full record is /api/requests/${id}.`,
			);
			return;
		}
		res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
		res.end(markdown);
	}

	private noSuchCall(res: http.ServerResponse, id: string): void {
		res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
		res.end(`LLMSpy: no captured call ${id}.`);
	}

	private badRequest(res: http.ServerResponse, message: string): void {
		res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
		res.end(`LLMSpy: ${message}`);
	}

	/** `GET /llms.txt`: the reference for agents. Not guarded: it holds no captured data. */
	private handleLlmsTxt(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		text: string,
	): void {
		res.writeHead(200, {
			'content-type': 'text/plain; charset=utf-8',
			'content-length': Buffer.byteLength(text),
			'cache-control': 'no-cache',
			'x-content-type-options': 'nosniff',
		});
		res.end(req.method === 'HEAD' ? undefined : text);
	}

	private handlePing(res: http.ServerResponse): void {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(
			JSON.stringify({
				status: 'running',
				message: 'LLMSpy proxy server is running',
				version: this.config.version,
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
			this.badRequest(res, `"${project}" is not a project name.`);
			return;
		}
		this.store.clear(project);
		// Reads waiting on a cleared call now find nothing, and say so.
		for (const id of [...this.waiting.keys()]) {
			if (this.store.get(id) === undefined) this.wake(id);
		}
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
		this.wake(id);
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
		for (const id of [...this.waiting.keys()]) this.wake(id);
		for (const client of this.sseClients) client.end();
		this.sseClients.clear();
		return new Promise((resolve) => {
			this.server.close(() => resolve());
			this.server.closeAllConnections();
		});
	}
}
