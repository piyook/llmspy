import type { CapturedRequest } from '../types.js';
import { anthropicMessages } from './anthropic.js';
import { openaiChat } from './openai-chat.js';
import { openaiResponses } from './openai-responses.js';
import { isEventStream, parseSseJson } from './sse.js';
import type {
	FormatParser,
	LlmExchange,
	LlmFormat,
	LlmRequest,
} from './types.js';

const PARSERS: Record<LlmFormat, FormatParser> = {
	'anthropic-messages': anthropicMessages,
	'openai-chat': openaiChat,
	'openai-responses': openaiResponses,
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

/** What the request body says, read once and reused while the reply streams. */
interface RequestPart {
	format: LlmFormat;
	fields?: LlmRequest;
	error?: string;
}

function readRequest(captured: CapturedRequest): RequestPart | undefined {
	const format = detectFormat(captured.method, captured.path);
	if (!format) return undefined;
	try {
		return {
			format,
			fields: PARSERS[format].parseRequest(JSON.parse(captured.body)),
		};
	} catch (error) {
		return { format, error: `request: ${(error as Error).message}` };
	}
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
	return readExchange(captured, readRequest(captured));
}

/**
 * `parseExchange` for one call that is read many times while its reply
 * streams. The request body does not change by then, and can be large, so it
 * is parsed again only when it does.
 */
export function exchangeParser(): (
	captured: CapturedRequest,
) => LlmExchange | undefined {
	let body: string | undefined;
	let request: RequestPart | undefined;
	return (captured) => {
		if (captured.body !== body) {
			body = captured.body;
			request = readRequest(captured);
		}
		return readExchange(captured, request);
	};
}

function readExchange(
	captured: CapturedRequest,
	request: RequestPart | undefined,
): LlmExchange | undefined {
	if (!request) return undefined;
	const { format } = request;
	const parser = PARSERS[format];

	const exchange: LlmExchange = {
		format,
		stream: false,
		messages: [],
		...request.fields,
	};
	const errors = request.error ? [request.error] : [];

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
