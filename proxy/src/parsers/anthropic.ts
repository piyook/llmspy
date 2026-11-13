import {
	asArray,
	asNumber,
	asRecord,
	asString,
	isRecord,
	type JsonObject,
} from './json.js';
import type {
	FormatParser,
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

/**
 * Rebuilds the content blocks from `content_block_start` and the deltas that
 * follow, then reads them as a normal response. Usage starts from
 * `message_start` and is updated by `message_delta`.
 */
function parseStream(events: unknown[]): LlmResponse {
	let started = false;
	let model: string | undefined;
	let stopReason: string | undefined;
	const usage: JsonObject = {};
	const blocks: JsonObject[] = [];
	const toolInputs: string[] = [];

	for (const raw of events) {
		const event = asRecord(raw);
		switch (event.type) {
			case 'message_start': {
				started = true;
				const message = asRecord(event.message);
				model = asString(message.model);
				Object.assign(usage, numbersOnly(message.usage));
				break;
			}
			case 'content_block_start': {
				const index = asNumber(event.index);
				if (index !== undefined) {
					blocks[index] = { ...asRecord(event.content_block) };
				}
				break;
			}
			case 'content_block_delta': {
				const index = asNumber(event.index);
				const block = index === undefined ? undefined : blocks[index];
				if (index === undefined || !block) break;
				const delta = asRecord(event.delta);
				if (delta.type === 'text_delta') {
					block.text =
						(asString(block.text) ?? '') +
						(asString(delta.text) ?? '');
				} else if (delta.type === 'thinking_delta') {
					block.thinking =
						(asString(block.thinking) ?? '') +
						(asString(delta.thinking) ?? '');
				} else if (delta.type === 'input_json_delta') {
					toolInputs[index] =
						(toolInputs[index] ?? '') +
						(asString(delta.partial_json) ?? '');
				}
				break;
			}
			case 'message_delta':
				stopReason =
					asString(asRecord(event.delta).stop_reason) ?? stopReason;
				Object.assign(usage, numbersOnly(event.usage));
				break;
		}
	}

	if (!started) return {};

	toolInputs.forEach((json, index) => {
		const block = blocks[index];
		if (block && json !== '') block.input = parseOrKeep(json);
	});

	return {
		model,
		output: {
			role: 'assistant',
			parts: blocks.filter(Boolean).map(toPart),
		},
		stopReason,
		usage: toUsage(usage),
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

/** Tool input JSON, or the text as received when a cut stream left it incomplete. */
function parseOrKeep(json: string): unknown {
	try {
		return JSON.parse(json);
	} catch {
		return json;
	}
}

export const anthropicMessages: FormatParser = {
	parseRequest,
	parseResponse,
	parseStream,
};
