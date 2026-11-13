import type { CapturedRequest } from '../types.js';
import { anthropicMessages } from './anthropic.js';
import { parseSseJson } from './sse.js';
import type { FormatParser, LlmExchange, LlmFormat } from './types.js';

const PARSERS: Partial<Record<LlmFormat, FormatParser>> = {
	'anthropic-messages': anthropicMessages,
};

/**
 * Which LLM API a request calls, from its method and path. The path, not the
 * upstream name, so a custom upstream that speaks a known API is parsed too.
 */
export function detectFormat(
	method: string,
	path: string,
): LlmFormat | undefined {
	if (method !== 'POST') return undefined;
	const pathname = new URL(path, 'http://x').pathname.replace(/\/+$/, '');
	if (pathname.endsWith('/v1/messages')) return 'anthropic-messages';
	if (pathname.endsWith('/chat/completions')) return 'openai-chat';
	if (pathname.endsWith('/responses')) return 'openai-responses';
	return undefined;
}

function isEventStream(contentType: string | string[] | undefined): boolean {
	return String(contentType ?? '')
		.toLowerCase()
		.startsWith('text/event-stream');
}

/**
 * Reads a captured exchange as an LLM API call. Returns `undefined` when the
 * path is not a known API. A body that cannot be parsed is noted in
 * `parseError`; whatever else could be read is kept. Only successful (2xx)
 * responses are parsed: error bodies are left to the raw view.
 */
export function parseExchange(
	captured: CapturedRequest,
): LlmExchange | undefined {
	const format = detectFormat(captured.method, captured.path);
	const parser = format && PARSERS[format];
	if (!format || !parser) return undefined;

	const exchange: LlmExchange = { format, stream: false, messages: [] };
	const errors: string[] = [];

	try {
		Object.assign(exchange, parser.parseRequest(JSON.parse(captured.body)));
	} catch (error) {
		errors.push(`request: ${(error as Error).message}`);
	}

	const response = captured.response;
	if (response && response.status >= 200 && response.status < 300) {
		try {
			const streamed = isEventStream(response.headers['content-type']);
			const { model, ...rest } = streamed
				? parser.parseStream(parseSseJson(response.body))
				: parser.parseResponse(JSON.parse(response.body));
			Object.assign(exchange, rest);
			// The response names the model that answered, which can differ from an alias asked for.
			if (model) exchange.model = model;
			if (streamed) exchange.stream = true;
		} catch (error) {
			errors.push(`response: ${(error as Error).message}`);
		}
	}

	if (errors.length > 0) exchange.parseError = errors.join('; ');
	return exchange;
}
