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

export function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: undefined;
}
