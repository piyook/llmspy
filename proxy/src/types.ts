import type { LlmExchange } from './parsers/types.js';

export type Headers = Record<string, string | string[]>;

export interface Timings {
	/** Epoch ms when the request reached LLMSpy. */
	start: number;
	/** Epoch ms when the upstream response headers arrived. */
	firstByte?: number;
	/**
	 * Epoch ms when the latest chunk of the response body arrived. Only for a
	 * reply passed on while it arrives (an uncompressed event stream).
	 */
	lastData?: number;
	/** Epoch ms when the response was fully sent, or the exchange failed. */
	end?: number;
}

export interface CapturedRequest {
	id: string;
	/** ISO time the request reached LLMSpy. */
	timestamp: string;
	/** From `/@<project>` in front of the upstream, else `general`. */
	project: string;
	/** Name of the upstream, from the path prefix (e.g. `anthropic`). */
	provider: string;
	/** Upstream host the request was forwarded to. */
	host: string;
	method: string;
	/** Path and query as sent upstream. */
	path: string;
	/** Request headers, with API keys masked. */
	headers: Headers;
	/** Request body, decompressed and decoded as UTF-8. */
	body: string;
	response?: {
		status: number;
		headers: Headers;
		/** Response body, decompressed and decoded as UTF-8. */
		body: string;
	};
	timings: Timings;
	/** `timings.end - timings.start`, in ms. */
	latency?: number;
	error?: string;
	/** The exchange read as an LLM API call, when the path is one LLMSpy knows. */
	llm?: LlmExchange;
}

export interface ProxyConfig {
	port: number;
	/** Interface to listen on. Captured requests hold API keys, so keep this local. */
	host: string;
	/** Path prefix name -> upstream base URL. */
	upstreams: Map<string, URL>;
	maxRequests: number;
	/** Folder of the built UI (`ui/dist`), served on the same port. */
	uiDir?: string;
}
