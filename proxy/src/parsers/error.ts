import { asString, isRecord } from './json.js';
import type { LlmError } from './types.js';

/**
 * Reads a provider error object: `{ type, message }` (Anthropic) or
 * `{ message, type, code }` (OpenAI). Returns `undefined` when the value is
 * not an object with a message, type or code.
 */
export function toLlmError(value: unknown): LlmError | undefined {
	if (!isRecord(value)) return undefined;
	const type = asString(value.type) ?? asString(value.code);
	const message = asString(value.message);
	if (type === undefined && message === undefined) return undefined;
	return type === undefined
		? { message: message ?? '' }
		: { type, message: message ?? '' };
}
