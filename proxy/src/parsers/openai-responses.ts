import { toLlmError } from './error.js';
import {
	asArray,
	asNumber,
	asRecord,
	asString,
	isRecord,
	type JsonObject,
	parseJsonOrKeep,
} from './json.js';
import { partsText, toRequest } from './openai-common.js';
import type {
	FormatParser,
	LlmError,
	LlmMessage,
	LlmPart,
	LlmRequest,
	LlmResponse,
	LlmTool,
	LlmUsage,
} from './types.js';

// OpenAI Responses API: POST /v1/responses. Input and output are lists of
// items (messages, reasoning, tool calls, tool outputs), not messages. With
// `previous_response_id` the earlier conversation is kept by OpenAI and only
// the new input is in the request.

/** Message content is a string or an array of parts. */
function contentParts(content: unknown): LlmPart[] {
	if (typeof content === 'string') return [{ type: 'text', text: content }];
	return asArray(content).map((part): LlmPart => {
		const p = asRecord(part);
		switch (p.type) {
			case 'input_text':
			case 'output_text':
				return { type: 'text', text: asString(p.text) ?? '' };
			case 'refusal':
				return { type: 'text', text: asString(p.refusal) ?? '' };
			case 'input_image':
				return { type: 'image' };
			default:
				return { type: 'other', raw: part };
		}
	});
}

/** Content as text; non-text parts become `[type]`. */
function contentText(content: unknown): string {
	return partsText(contentParts(content));
}

/** A tool output is a string, an array of content parts, or an object. */
function outputText(output: unknown): string {
	if (output === undefined || typeof output === 'string') return output ?? '';
	if (Array.isArray(output)) return contentText(output);
	return JSON.stringify(output);
}

/** The parts of an item the model produced: a message, reasoning or a tool call. */
function outputParts(raw: unknown): LlmPart[] {
	const item = asRecord(raw);
	switch (item.type) {
		case 'message':
			return contentParts(item.content);
		case 'reasoning': {
			// Reasoning is often encrypted only; then the part is empty but shows it happened.
			const text = [...asArray(item.summary), ...asArray(item.content)]
				.map((part) => asString(asRecord(part).text))
				.filter((text) => text !== undefined)
				.join('\n\n');
			return [{ type: 'thinking', text }];
		}
		case 'function_call': {
			const args = item.arguments;
			return [
				{
					type: 'tool_call',
					id: asString(item.call_id) ?? '',
					name: asString(item.name) ?? '',
					input:
						typeof args === 'string' ? parseJsonOrKeep(args) : args,
				},
			];
		}
		case 'custom_tool_call':
			return [
				{
					type: 'tool_call',
					id: asString(item.call_id) ?? '',
					name: asString(item.name) ?? '',
					input: item.input,
				},
			];
		default:
			// Built-in tool calls (web search, file search, MCP and others).
			return [{ type: 'other', raw }];
	}
}

/** Appends to the last message when it is the assistant's, so one turn is one message. */
function pushAssistant(messages: LlmMessage[], parts: LlmPart[]): void {
	const last = messages.at(-1);
	if (last?.role === 'assistant') last.parts.push(...parts);
	else messages.push({ role: 'assistant', parts });
}

function toUsage(usage: unknown): LlmUsage | undefined {
	if (!isRecord(usage)) return undefined;
	return {
		input: asNumber(usage.input_tokens),
		output: asNumber(usage.output_tokens),
		cacheRead: asNumber(asRecord(usage.input_tokens_details).cached_tokens),
		reasoning: asNumber(
			asRecord(usage.output_tokens_details).reasoning_tokens,
		),
	};
}

/** Function and custom tools have a name; built-in tools are named by their MCP server or type. */
function toTool(tool: unknown): LlmTool {
	const t = asRecord(tool);
	return {
		name:
			asString(t.name) ??
			asString(t.server_label) ??
			asString(t.type) ??
			'',
		description: asString(t.description),
	};
}

function parseRequest(body: unknown): LlmRequest {
	const b = asRecord(body);
	const system: string[] = [];
	const messages: LlmMessage[] = [];

	const instructions = asString(b.instructions);
	if (instructions) system.push(instructions);

	const input =
		typeof b.input === 'string' ? [{ content: b.input }] : b.input;
	for (const raw of asArray(input)) {
		const item = asRecord(raw);
		// Messages may leave out `type`.
		const type = asString(item.type) ?? 'message';
		if (type === 'message') {
			switch (item.role) {
				case 'system':
				case 'developer':
					system.push(contentText(item.content));
					break;
				case 'assistant':
					pushAssistant(messages, contentParts(item.content));
					break;
				default:
					messages.push({
						role: 'user',
						parts: contentParts(item.content),
					});
			}
		} else if (type.endsWith('_output')) {
			messages.push({
				role: 'tool',
				parts: [
					{
						type: 'tool_result',
						id: asString(item.call_id) ?? '',
						content: outputText(item.output),
					},
				],
			});
		} else {
			pushAssistant(messages, outputParts(item));
		}
	}

	const tools = asArray(b.tools).map(toTool);
	return toRequest(b, system, messages, tools);
}

/**
 * There is no finish reason: `status` is `completed`, `incomplete` or
 * `failed`, and an incomplete response says why (`max_output_tokens`). A
 * failed response says what went wrong in `error`.
 */
function parseResponse(body: unknown): LlmResponse {
	const b = asRecord(body);
	const error = toLlmError(b.error);
	return {
		model: asString(b.model),
		output: {
			role: 'assistant',
			parts: asArray(b.output).flatMap(outputParts),
		},
		stopReason:
			asString(asRecord(b.incomplete_details).reason) ??
			asString(b.status),
		usage: toUsage(b.usage),
		...(error && { error }),
	};
}

/** An `error` event has `code` and `message` at its top level, or in an `error` object. */
function errorEvent(event: JsonObject): LlmError {
	const fields = isRecord(event.error)
		? event.error
		: { code: event.code, message: event.message };
	return toLlmError(fields) ?? { message: '' };
}

/** Delta events, and the field of their item they add to. */
const DELTAS: Record<string, (item: JsonObject, text: string) => void> = {
	'response.output_text.delta': (item, text) => {
		item.content = [{ type: 'output_text', text }];
	},
	'response.refusal.delta': (item, text) => {
		item.content = [{ type: 'refusal', refusal: text }];
	},
	'response.function_call_arguments.delta': (item, text) => {
		item.arguments = text;
	},
	'response.custom_tool_call_input.delta': (item, text) => {
		item.input = text;
	},
	'response.reasoning_summary_text.delta': (item, text) => {
		item.summary = [{ type: 'summary_text', text }];
	},
	'response.reasoning_text.delta': (item, text) => {
		item.content = [{ type: 'reasoning_text', text }];
	},
};

const CLOSING_EVENTS = new Set([
	'response.completed',
	'response.incomplete',
	'response.failed',
]);

/** The output items so far, and the joined deltas of each. */
interface ItemsState {
	items: JsonObject[];
	/** Items whose `output_item.done` came; it holds the whole item. */
	finished: Set<number>;
	/** By output index and delta event type. */
	deltas: Map<string, { index: number; type: string; text: string }>;
}

/** Keeps an output item, or adds a delta piece to the ones for its item. */
function addItemEvent(
	state: ItemsState,
	type: string,
	event: JsonObject,
): void {
	const index = asNumber(event.output_index);
	if (index === undefined) return;
	if (
		type === 'response.output_item.added' ||
		type === 'response.output_item.done'
	) {
		state.items[index] = { ...asRecord(event.item) };
		if (type === 'response.output_item.done') state.finished.add(index);
	} else if (Object.hasOwn(DELTAS, type)) {
		const key = `${index} ${type}`;
		const delta = state.deltas.get(key) ?? { index, type, text: '' };
		delta.text += asString(event.delta) ?? '';
		state.deltas.set(key, delta);
	}
}

/** The items, with the deltas written into those not finished. */
function rebuiltItems(state: ItemsState): JsonObject[] {
	for (const { index, type, text } of state.deltas.values()) {
		const item = state.items[index];
		if (item && !state.finished.has(index)) DELTAS[type]?.(item, text);
	}
	return state.items;
}

/**
 * The closing event (`response.completed`, `.incomplete` or `.failed`)
 * carries the whole response, so that is read. A stream cut short before it
 * is rebuilt from the output items and the deltas of those not finished.
 * An `error` event is kept unless the closing event names its own error.
 */
function parseStream(events: unknown[]): LlmResponse {
	if (events.length === 0) return {};

	let model: string | undefined;
	let error: LlmError | undefined;
	const state: ItemsState = {
		items: [],
		finished: new Set(),
		deltas: new Map(),
	};

	for (const raw of events) {
		const event = asRecord(raw);
		const type = asString(event.type) ?? '';
		if (CLOSING_EVENTS.has(type)) {
			const response = parseResponse(event.response);
			if (error && !response.error) response.error = error;
			return response;
		}
		if (type === 'error') {
			error = errorEvent(event);
			continue;
		}
		model = asString(asRecord(event.response).model) ?? model;
		addItemEvent(state, type, event);
	}

	return {
		model,
		output: {
			role: 'assistant',
			parts: rebuiltItems(state).flatMap(outputParts),
		},
		...(error && { error }),
	};
}

export const openaiResponses: FormatParser = {
	parseRequest,
	parseResponse,
	parseStream,
};
