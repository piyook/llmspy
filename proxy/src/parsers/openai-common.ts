import { asString, type JsonObject } from './json.js';
import type { LlmMessage, LlmPart, LlmRequest, LlmTool } from './types.js';

// Helpers shared by the OpenAI Chat Completions and Responses parsers.

/** Parts as text; non-text parts become `[type]`. */
export function partsText(parts: LlmPart[]): string {
	return parts
		.map((part) => (part.type === 'text' ? part.text : `[${part.type}]`))
		.join('\n');
}

/** The request as read: system texts joined, empty lists left out. */
export function toRequest(
	body: JsonObject,
	system: string[],
	messages: LlmMessage[],
	tools: LlmTool[],
): LlmRequest {
	return {
		model: asString(body.model),
		stream: body.stream === true,
		system: system.length > 0 ? system.join('\n\n') : undefined,
		messages,
		tools: tools.length > 0 ? tools : undefined,
	};
}
