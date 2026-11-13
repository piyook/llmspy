/** The LLM APIs LLMSpy can parse. */
export type LlmFormat =
	| 'anthropic-messages'
	| 'openai-chat'
	| 'openai-responses';

export type LlmPart =
	| { type: 'text'; text: string }
	| { type: 'thinking'; text: string }
	| { type: 'tool_call'; id: string; name: string; input: unknown }
	| { type: 'tool_result'; id: string; content: string; isError?: boolean }
	/** Image data is left out; it is still in the raw body. */
	| { type: 'image' }
	/** A block LLMSpy has no view for, kept as sent. */
	| { type: 'other'; raw: unknown };

export interface LlmMessage {
	role: 'user' | 'assistant' | 'tool';
	parts: LlmPart[];
}

export interface LlmTool {
	name: string;
	description?: string;
}

/**
 * Token counts as the provider reports them. Providers count differently
 * (Anthropic's `input` excludes cached tokens, OpenAI's includes them), so
 * these are not comparable across formats.
 */
export interface LlmUsage {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	reasoning?: number;
}

/** What a parser reads from a request body. */
export interface LlmRequest {
	model?: string;
	stream: boolean;
	system?: string;
	/** The conversation sent, oldest first. */
	messages: LlmMessage[];
	tools?: LlmTool[];
}

/** What a parser reads from a response body or a reassembled stream. */
export interface LlmResponse {
	model?: string;
	/** The reply, reassembled if it was streamed. */
	output?: LlmMessage;
	stopReason?: string;
	usage?: LlmUsage;
}

/** One captured exchange read as an LLM API call, in the same shape for every format. */
export interface LlmExchange extends LlmRequest, LlmResponse {
	format: LlmFormat;
	/** Set when a body could not be parsed; the capture itself is unaffected. */
	parseError?: string;
}

export interface FormatParser {
	parseRequest(body: unknown): LlmRequest;
	parseResponse(body: unknown): LlmResponse;
	/** Reassembles a streamed response from the JSON `data` of its SSE events. */
	parseStream(events: unknown[]): LlmResponse;
}
