import type { LlmExchange, LlmMessage, LlmPart, LlmUsage } from './types.js';

const PREVIEW_LENGTH = 80;

/** Tool call id -> tool name, from every call in the conversation and the reply. */
export function toolNames(llm: LlmExchange): Map<string, string> {
	const names = new Map<string, string>();
	const messages = llm.output ? [...llm.messages, llm.output] : llm.messages;
	for (const message of messages) {
		for (const part of message.parts) {
			if (part.type === 'tool_call') names.set(part.id, part.name);
		}
	}
	return names;
}

/** One line that stands in for a folded message. */
export function preview(
	message: LlmMessage,
	names: Map<string, string>,
): string {
	for (const part of message.parts) {
		const line = partPreview(part, names);
		if (line) return shorten(line);
	}
	return '';
}

function partPreview(part: LlmPart, names: Map<string, string>): string {
	switch (part.type) {
		case 'text':
			return part.text;
		case 'tool_call':
			return `tool call: ${part.name}`;
		case 'tool_result':
			return `result of ${names.get(part.id) ?? 'unknown tool'}`;
		case 'image':
			return '[image]';
		default:
			return '';
	}
}

function shorten(text: string): string {
	const line = text.replace(/\s+/g, ' ').trim();
	return line.length > PREVIEW_LENGTH
		? `${line.slice(0, PREVIEW_LENGTH)}…`
		: line;
}

const USAGE_LABELS: [keyof LlmUsage, string][] = [
	['input', 'in'],
	['output', 'out'],
	['cacheRead', 'cache read'],
	['cacheWrite', 'cache write'],
	['reasoning', 'reasoning'],
];

/** The token counts the provider reported, e.g. `['in 1,234', 'out 340']`. */
export function usageSummary(usage?: LlmUsage): string[] {
	if (!usage) return [];
	return USAGE_LABELS.flatMap(([key, label]) => {
		const count = usage[key];
		return count === undefined
			? []
			: [`${label} ${count.toLocaleString()}`];
	});
}
