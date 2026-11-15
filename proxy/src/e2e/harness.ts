import { fileURLToPath } from 'node:url';
import { startServer } from 'llmock';
import { expect, vi } from 'vitest';
import type { LlmMessage } from '../parsers/types.js';
import { ProxyServer } from '../proxy.js';
import { RequestStore } from '../store.js';
import type { CapturedRequest } from '../types.js';

// The same config `npm run mock` uses, wherever Vitest's cwd is. Its rules
// answer the markers (#tools, #max-tokens, ...) in the last user message.
const CONFIG = fileURLToPath(
	new URL('../../../mock/.llmockrc.json', import.meta.url),
);

export interface Rig {
	/** The proxy's base URL for the upstream, e.g. `http://127.0.0.1:1234/anthropic` */
	base: string;
	/**
	 * Sends a JSON POST to `path` under `base` and waits until LLMSpy has
	 * finished capturing it. `body` is what the client read, or undefined when
	 * the connection broke off.
	 */
	post(
		path: string,
		headers: Record<string, string>,
		json: unknown,
	): Promise<{ status: number; body?: string; record: CapturedRequest }>;
	stop(): Promise<void>;
}

/**
 * Starts llmock with one preset of the dev config, and a proxy in front of it
 * under `upstream`. llmock runs one server per process, so one rig per file.
 */
export async function startRig(model: string, upstream: string): Promise<Rig> {
	const llmock = await startServer({
		config: CONFIG,
		model,
		port: 0,
		settings: { delayMin: 0, delayMax: 0 },
	});
	const store = new RequestStore();
	const proxy = new ProxyServer(
		{
			port: 0,
			host: '127.0.0.1',
			upstreams: new Map([[upstream, new URL(llmock.url)]]),
		},
		store,
	);
	const base = `http://127.0.0.1:${await proxy.start()}/${upstream}`;

	return {
		base,
		async post(path, headers, json) {
			const before = store.getRequests().length;
			const res = await fetch(`${base}${path}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...headers },
				body: JSON.stringify(json),
			});
			const body = await res.text().catch(() => undefined);
			const record = await vi.waitFor(() => {
				const requests = store.getRequests();
				expect(requests).toHaveLength(before + 1);
				expect(requests[0].timings.end).toBeDefined();
				return requests[0];
			});
			return { status: res.status, body, record };
		},
		async stop() {
			await proxy.stop();
			await llmock.close();
		},
	};
}

/** The JSON `data` of each event in an SSE body, `[DONE]` left out. */
export function sseData(body: string): unknown[] {
	return body
		.split('\n')
		.filter((line) => line.startsWith('data:'))
		.map((line) => line.slice(5).trim())
		.filter((data) => data !== '[DONE]')
		.map((data) => JSON.parse(data));
}

/** The text parts of a parsed message, joined. */
export function replyText(output: LlmMessage | undefined): string {
	return (output?.parts ?? [])
		.map((part) => (part.type === 'text' ? part.text : ''))
		.join('');
}
