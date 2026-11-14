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

// OpenAI Chat Completions API: POST /v1/chat/completions. Many other servers
// (Ollama, vLLM and others) speak it too, some with a `reasoning_content` or
// `reasoning` field for the model's thinking, which is read as well.

/** Message content is a string, an array of parts, or null. */
function contentParts(content: unknown): LlmPart[] {
	if (typeof content === 'string') return [{ type: 'text', text: content }];
	return asArray(content).map((part): LlmPart => {
		const p = asRecord(part);
		switch (p.type) {
			case 'text':
				return { type: 'text', text: asString(p.text) ?? '' };
			case 'image_url':
				return { type: 'image' };
			default:
				return { type: 'other', raw: part };
		}
	});
}

/** Content as text; non-text parts become `[type]`. */
function contentText(content: unknown): string {
	return contentParts(content)
		.map((part) => (part.type === 'text' ? part.text : `[${part.type}]`))
		.join('\n');
}

/** A function or custom tool call. Function arguments are a JSON string. */
function toolCall(call: unknown): LlmPart {
	const c = asRecord(call);
	if (c.type === 'custom') {
		const custom = asRecord(c.custom);
		return {
			type: 'tool_call',
			id: asString(c.id) ?? '',
			name: asString(custom.name) ?? '',
			input: custom.input,
		};
	}
	const fn = asRecord(c.function);
	const args = fn.arguments;
	return {
		type: 'tool_call',
		id: asString(c.id) ?? '',
		name: asString(fn.name) ?? '',
		input: typeof args === 'string' ? parseJsonOrKeep(args) : args,
	};
}

/** An assistant message in order: thinking, text, refusal, tool calls. */
function assistantParts(message: JsonObject): LlmPart[] {
	const parts: LlmPart[] = [];
	const reasoning =
		asString(message.reasoning_content) ?? asString(message.reasoning);
	if (reasoning) parts.push({ type: 'thinking', text: reasoning });

	// A reply that only calls tools has `content: null` or `""`.
	if (message.content !== '') parts.push(...contentParts(message.content));

	const refusal = asString(message.refusal);
	if (refusal) parts.push({ type: 'text', text: refusal });

	for (const call of asArray(message.tool_calls)) parts.push(toolCall(call));
	// Deprecated single `function_call`, which has no id.
	if (isRecord(message.function_call)) {
		parts.push(toolCall({ function: message.function_call }));
	}
	return parts;
}

function toUsage(usage: unknown): LlmUsage | undefined {
	if (!isRecord(usage)) return undefined;
	return {
		input: asNumber(usage.prompt_tokens),
		output: asNumber(usage.completion_tokens),
		cacheRead: asNumber(
			asRecord(usage.prompt_tokens_details).cached_tokens,
		),
		reasoning: asNumber(
			asRecord(usage.completion_tokens_details).reasoning_tokens,
		),
	};
}

function toTool(tool: unknown): LlmTool {
	const t = asRecord(tool);
	// `tools` entries wrap the definition; deprecated `functions` entries are it.
	const definition = asRecord(
		t.type === 'custom' ? t.custom : (t.function ?? tool),
	);
	return {
		name: asString(definition.name) ?? '',
		description: asString(definition.description),
	};
}

function parseRequest(body: unknown): LlmRequest {
	const b = asRecord(body);
	const system: string[] = [];
	const messages: LlmMessage[] = [];

	for (const raw of asArray(b.messages)) {
		const m = asRecord(raw);
		switch (m.role) {
			case 'system':
			case 'developer':
				system.push(contentText(m.content));
				break;
			case 'assistant':
				messages.push({ role: 'assistant', parts: assistantParts(m) });
				break;
			case 'tool':
			case 'function':
				messages.push({
					role: 'tool',
					parts: [
						{
							type: 'tool_result',
							// Deprecated `function` messages name the function instead of a call id.
							id:
								asString(m.tool_call_id) ??
								asString(m.name) ??
								'',
							content: contentText(m.content),
						},
					],
				});
				break;
			default:
				messages.push({ role: 'user', parts: contentParts(m.content) });
		}
	}

	const tools = [...asArray(b.tools), ...asArray(b.functions)].map(toTool);
	return {
		model: asString(b.model),
		stream: b.stream === true,
		system: system.length > 0 ? system.join('\n\n') : undefined,
		messages,
		tools: tools.length > 0 ? tools : undefined,
	};
}

/** Only the first choice is read; `n` > 1 is rare. */
function parseResponse(body: unknown): LlmResponse {
	const b = asRecord(body);
	const choice = asRecord(asArray(b.choices)[0]);
	return {
		model: asString(b.model),
		output: {
			role: 'assistant',
			parts: assistantParts(asRecord(choice.message)),
		},
		stopReason: asString(choice.finish_reason),
		usage: toUsage(b.usage),
	};
}

/**
 * Joins the deltas of the first choice into one message: text pieces in
 * order, tool calls by their `index` with the id and name from the first
 * delta and the argument pieces appended. Usage comes in a last chunk with
 * no choices, only when the request asked for it (`stream_options`). A
 * failure part-way is a chunk holding an `error` object and no choices.
 */
function parseStream(events: unknown[]): LlmResponse {
	if (events.length === 0) return {};

	let model: string | undefined;
	let stopReason: string | undefined;
	let usage: unknown;
	let error: LlmError | undefined;
	let content = '';
	let reasoning = '';
	let refusal = '';
	const calls: { id: string; name: string; arguments: string }[] = [];

	for (const raw of events) {
		const chunk = asRecord(raw);
		model = asString(chunk.model) ?? model;
		if (isRecord(chunk.usage)) usage = chunk.usage;
		if (isRecord(chunk.error)) {
			error = toLlmError(chunk.error) ?? { message: '' };
		}

		const choice = asArray(chunk.choices)
			.map(asRecord)
			.find((c) => (asNumber(c.index) ?? 0) === 0);
		if (!choice) continue;
		stopReason = asString(choice.finish_reason) ?? stopReason;

		const delta = asRecord(choice.delta);
		content += asString(delta.content) ?? '';
		reasoning +=
			asString(delta.reasoning_content) ??
			asString(delta.reasoning) ??
			'';
		refusal += asString(delta.refusal) ?? '';
		for (const piece of asArray(delta.tool_calls)) {
			const p = asRecord(piece);
			const fn = asRecord(p.function);
			const index = asNumber(p.index) ?? 0;
			calls[index] ??= { id: '', name: '', arguments: '' };
			const call = calls[index];
			call.id ||= asString(p.id) ?? '';
			call.name ||= asString(fn.name) ?? '';
			call.arguments += asString(fn.arguments) ?? '';
		}
	}

	const message: JsonObject = {
		reasoning_content: reasoning,
		content,
		refusal,
		tool_calls: calls.filter(Boolean).map((call) => ({
			id: call.id,
			function: { name: call.name, arguments: call.arguments },
		})),
	};
	return {
		model,
		output: { role: 'assistant', parts: assistantParts(message) },
		stopReason,
		usage: toUsage(usage),
		...(error && { error }),
	};
}

export const openaiChat: FormatParser = {
	parseRequest,
	parseResponse,
	parseStream,
};
