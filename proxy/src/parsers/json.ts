// Narrowing helpers for JSON of unknown shape: parsers read bodies that may
// not match the API, and must never throw because of it.

export type JsonObject = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): JsonObject {
	return isRecord(value) ? value : {};
}

export function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/**
 * Parsed JSON, or the text as received when it is not valid JSON: tool
 * arguments a cut stream left incomplete, or a model that wrote bad JSON.
 */
export function parseJsonOrKeep(json: string): unknown {
	try {
		return JSON.parse(json);
	} catch {
		return json;
	}
}

export function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: undefined;
}
