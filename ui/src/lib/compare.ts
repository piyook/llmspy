import { type Change, diffLines } from 'diff';
import { USAGE_LABELS } from './conversation.js';
import type {
	CapturedRequest,
	LlmExchange,
	LlmMessage,
	LlmUsage,
} from './types.js';

/**
 * Comparisons read from `other` to `call`: "added" means in `call` and not
 * in `other`. `call` is the selected request, `other` the one it is compared
 * with, by default the call before it.
 */

/** The latest call to the same upstream that reached LLMSpy before `call`. */
export function previousCall(
	requests: Iterable<CapturedRequest>,
	call: CapturedRequest,
): CapturedRequest | undefined {
	let previous: CapturedRequest | undefined;
	for (const request of requests) {
		if (
			request.provider === call.provider &&
			request.timings.start < call.timings.start &&
			(!previous || request.timings.start > previous.timings.start)
		) {
			previous = request;
		}
	}
	return previous;
}

/** A value that differs between the two calls. */
export interface FieldChange {
	label: string;
	other: string;
	call: string;
}

/** Format, model, streaming and stop reason, where they differ. */
export function fieldChanges(
	other: LlmExchange,
	call: LlmExchange,
): FieldChange[] {
	const fields: [string, (llm: LlmExchange) => string][] = [
		['format', (llm) => llm.format],
		['model', (llm) => llm.model ?? '-'],
		['stream', (llm) => (llm.stream ? 'streamed' : 'not streamed')],
		['stop', (llm) => llm.stopReason ?? '-'],
	];
	return fields.flatMap(([label, read]) => {
		const before = read(other);
		const after = read(call);
		return before === after ? [] : [{ label, other: before, call: after }];
	});
}

/** One token count from both calls, e.g. `{label: 'in', other: 1200, call: 1500}`. */
export interface UsageChange {
	label: string;
	other?: number;
	call?: number;
}

/** Every token count either call reported. */
export function usageChanges(other?: LlmUsage, call?: LlmUsage): UsageChange[] {
	return USAGE_LABELS.flatMap(([key, label]) => {
		const before = other?.[key];
		const after = call?.[key];
		return before === undefined && after === undefined
			? []
			: [{ label, other: before, call: after }];
	});
}

/** `+266`, `-12` or `±0`; empty when either count is missing. */
export function formatDelta(change: UsageChange): string {
	if (change.other === undefined || change.call === undefined) return '';
	const delta = change.call - change.other;
	if (delta === 0) return '±0';
	return `${delta > 0 ? '+' : '-'}${Math.abs(delta).toLocaleString()}`;
}

/** Line changes from `other` to `call`, or undefined when the texts are the same. */
export function textChanges(other = '', call = ''): Change[] | undefined {
	return other === call ? undefined : diffLines(other, call);
}

export interface ToolChanges {
	added: string[];
	removed: string[];
	/** Same name, different description. */
	changed: string[];
}

/** Tools by name; undefined when both calls offer the same tools. */
export function toolChanges(
	other: LlmExchange,
	call: LlmExchange,
): ToolChanges | undefined {
	const before = new Map(
		(other.tools ?? []).map((tool) => [tool.name, tool.description]),
	);
	const after = new Map(
		(call.tools ?? []).map((tool) => [tool.name, tool.description]),
	);
	const added = [...after.keys()].filter((name) => !before.has(name));
	const removed = [...before.keys()].filter((name) => !after.has(name));
	const changed = [...after.keys()].filter(
		(name) => before.has(name) && before.get(name) !== after.get(name),
	);
	return added.length || removed.length || changed.length
		? { added, removed, changed }
		: undefined;
}

export interface MessageChanges {
	/** How many messages both calls start with, unchanged. */
	same: number;
	/** The messages of `other` after the shared start. */
	other: LlmMessage[];
	/** The messages of `call` after the shared start. */
	call: LlmMessage[];
}

/**
 * The messages the two conversations share from the start, and what follows.
 * In an agent loop the next call repeats the conversation so far and adds to
 * it, so `other` is then empty and `call` holds the new messages.
 */
export function messageChanges(
	other: LlmMessage[],
	call: LlmMessage[],
): MessageChanges {
	let same = 0;
	while (
		same < other.length &&
		same < call.length &&
		sameMessage(other[same], call[same])
	) {
		same++;
	}
	return { same, other: other.slice(same), call: call.slice(same) };
}

// Parsed messages are plain data built by the same parser, so the same
// message gives the same JSON.
function sameMessage(a: LlmMessage, b: LlmMessage): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** One line saying how the two conversations relate. */
export function messageSummary(changes: MessageChanges): string {
	const { same, other, call } = changes;
	if (!other.length && !call.length) {
		return same === 1
			? 'The one message is the same.'
			: `All ${same} messages the same.`;
	}
	const start =
		same === 0
			? 'Different from the first message'
			: `First ${same} the same`;
	if (!other.length) return `${start}, ${count(call.length)} added.`;
	if (!call.length) return `${start}, ${count(other.length)} left out.`;
	return `${start}, then ${other.length} in the other call and ${call.length} in this one.`;
}

function count(messages: number): string {
	return messages === 1 ? '1 message' : `${messages} messages`;
}

/** A line of a diff as shown, or a run of unchanged lines folded away. */
export type DiffRow =
	| { kind: 'same' | 'added' | 'removed'; text: string }
	| { kind: 'fold'; lines: string[] };

/**
 * Splits changes into lines, folding each unchanged run longer than
 * `2 * context + 1` lines down to `context` lines either side of it.
 */
export function diffRows(changes: Change[], context = 3): DiffRow[] {
	const rows: DiffRow[] = [];
	changes.forEach((change, i) => {
		const lines = splitLines(change.value);
		if (change.added || change.removed) {
			const kind = change.added ? 'added' : 'removed';
			for (const text of lines) rows.push({ kind, text });
			return;
		}
		// No context is needed before the first change or after the last.
		const before = i === 0 ? 0 : context;
		const after = i === changes.length - 1 ? 0 : context;
		if (lines.length <= before + after + 1) {
			for (const text of lines) rows.push({ kind: 'same', text });
			return;
		}
		for (const text of lines.slice(0, before))
			rows.push({ kind: 'same', text });
		rows.push({
			kind: 'fold',
			lines: lines.slice(before, lines.length - after),
		});
		for (const text of lines.slice(lines.length - after)) {
			rows.push({ kind: 'same', text });
		}
	});
	return rows;
}

// A change's value ends with the newline of its last line, which is not
// another line.
function splitLines(value: string): string[] {
	const lines = value.split('\n');
	if (lines.at(-1) === '') lines.pop();
	return lines;
}
