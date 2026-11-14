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

// Anthropic Messages API: POST /v1/messages.

/** A tool result's content as text; non-text blocks become `[type]`. */
function toolResultText(content: unknown): string {
	if (typeof content === 'string') return content;
	return asArray(content)
		.map((block) => {
			const b = asRecord(block);
			return b.type === 'text'
				? (asString(b.text) ?? '')
				: `[${asString(b.type) ?? 'block'}]`;
		})
		.join('\n');
}

function toPart(block: unknown): LlmPart {
	const b = asRecord(block);
	switch (b.type) {
		case 'text':
			return { type: 'text', text: asString(b.text) ?? '' };
		case 'thinking':
			return { type: 'thinking', text: asString(b.thinking) ?? '' };
		case 'tool_use':
			return {
				type: 'tool_call',
				id: asString(b.id) ?? '',
				name: asString(b.name) ?? '',
				input: b.input,
			};
		case 'tool_result': {
			const part: LlmPart = {
				type: 'tool_result',
				id: asString(b.tool_use_id) ?? '',
				content: toolResultText(b.content),
			};
			if (b.is_error === true) part.isError = true;
			return part;
		}
		case 'image':
			return { type: 'image' };
		default:
			return { type: 'other', raw: block };
	}
}

/** Message content is a string or an array of blocks. */
function toParts(content: unknown): LlmPart[] {
	if (typeof content === 'string') return [{ type: 'text', text: content }];
	return asArray(content).map(toPart);
}

function toMessage(message: unknown): LlmMessage {
	const m = asRecord(message);
	return {
		role: m.role === 'assistant' ? 'assistant' : 'user',
		parts: toParts(m.content),
	};
}

/** `system` is a string or an array of text blocks. */
function systemText(system: unknown): string | undefined {
	if (typeof system === 'string') return system;
	const texts = asArray(system)
		.map((block) => asString(asRecord(block).text))
		.filter((text) => text !== undefined);
	return texts.length > 0 ? texts.join('\n\n') : undefined;
}

function toUsage(usage: unknown): LlmUsage | undefined {
	if (!isRecord(usage)) return undefined;
	return {
		input: asNumber(usage.input_tokens),
		output: asNumber(usage.output_tokens),
		cacheRead: asNumber(usage.cache_read_input_tokens),
		cacheWrite: asNumber(usage.cache_creation_input_tokens),
	};
}

function parseRequest(body: unknown): LlmRequest {
	const b = asRecord(body);
	const tools: LlmTool[] = asArray(b.tools).map((tool) => {
		const t = asRecord(tool);
		return {
			name: asString(t.name) ?? '',
			description: asString(t.description),
		};
	});
	return {
		model: asString(b.model),
		stream: b.stream === true,
		system: systemText(b.system),
		messages: asArray(b.messages).map(toMessage),
		tools: tools.length > 0 ? tools : undefined,
	};
}

function parseResponse(body: unknown): LlmResponse {
	const b = asRecord(body);
	return {
		model: asString(b.model),
		output: { role: 'assistant', parts: toParts(b.content) },
		stopReason: asString(b.stop_reason),
		usage: toUsage(b.usage),
	};
}

/** What a stream has said so far. */
interface StreamState {
	started: boolean;
	model?: string;
	stopReason?: string;
	error?: LlmError;
	usage: JsonObject;
	blocks: JsonObject[];
	/** The `input_json_delta` pieces of each tool use block, joined. */
	toolInputs: string[];
}

/** Adds a delta to its block: text and thinking to the block, tool input JSON to the side. */
function addDelta(state: StreamState, event: JsonObject): void {
	const index = asNumber(event.index);
	if (index === undefined || !state.blocks[index]) return;
	const block = state.blocks[index];
	const delta = asRecord(event.delta);
	const piece = (field: string) => asString(delta[field]) ?? '';
	switch (delta.type) {
		case 'text_delta':
			block.text = (asString(block.text) ?? '') + piece('text');
			break;
		case 'thinking_delta':
			block.thinking =
				(asString(block.thinking) ?? '') + piece('thinking');
			break;
		case 'input_json_delta':
			state.toolInputs[index] =
				(state.toolInputs[index] ?? '') + piece('partial_json');
			break;
	}
}

/** Stream events, and what each one changes. Other events are ignored. */
const EVENTS: Record<string, (state: StreamState, event: JsonObject) => void> =
	{
		message_start: (state, event) => {
			state.started = true;
			const message = asRecord(event.message);
			state.model = asString(message.model);
			Object.assign(state.usage, numbersOnly(message.usage));
		},
		content_block_start: (state, event) => {
			const index = asNumber(event.index);
			if (index !== undefined) {
				state.blocks[index] = { ...asRecord(event.content_block) };
			}
		},
		content_block_delta: addDelta,
		message_delta: (state, event) => {
			state.stopReason =
				asString(asRecord(event.delta).stop_reason) ?? state.stopReason;
			Object.assign(state.usage, numbersOnly(event.usage));
		},
		error: (state, event) => {
			state.error = toLlmError(event.error) ?? { message: '' };
		},
	};

/**
 * Rebuilds the content blocks from `content_block_start` and the deltas that
 * follow, then reads them as a normal response. Usage starts from
 * `message_start` and is updated by `message_delta`. An `error` event ends
 * the reply part-way; what came before it is kept.
 */
function parseStream(events: unknown[]): LlmResponse {
	const state: StreamState = {
		started: false,
		usage: {},
		blocks: [],
		toolInputs: [],
	};
	for (const raw of events) {
		const event = asRecord(raw);
		const type = asString(event.type) ?? '';
		if (Object.hasOwn(EVENTS, type)) EVENTS[type]?.(state, event);
	}

	const { started, model, stopReason, error, usage, blocks } = state;
	if (!started) return error ? { error } : {};

	state.toolInputs.forEach((json, index) => {
		const block = blocks[index];
		if (block && json !== '') block.input = parseJsonOrKeep(json);
	});

	return {
		model,
		output: {
			role: 'assistant',
			parts: blocks.filter(Boolean).map(toPart),
		},
		stopReason,
		usage: toUsage(usage),
		...(error && { error }),
	};
}

/** The numeric fields of an object, so a later `null` never hides an earlier count. */
function numbersOnly(value: unknown): JsonObject {
	return Object.fromEntries(
		Object.entries(asRecord(value)).filter(
			([, field]) => asNumber(field) !== undefined,
		),
	);
}

export const anthropicMessages: FormatParser = {
	parseRequest,
	parseResponse,
	parseStream,
};
