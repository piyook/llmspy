import { describe, expect, it } from 'vitest';
import {
	bodyChanges,
	diffRows,
	fieldChanges,
	formatDelta,
	messageChanges,
	messageSummary,
	prettyBody,
	previousCall,
	textChanges,
	toolChanges,
	usageChanges,
} from './compare.js';
import type { CapturedRequest, LlmExchange, LlmMessage } from './types.js';

function request(id: string, provider: string, start: number): CapturedRequest {
	return {
		id,
		timestamp: new Date(start).toISOString(),
		provider,
		host: 'api.example.com',
		method: 'POST',
		path: '/v1/messages',
		headers: {},
		body: '{}',
		timings: { start },
	};
}

function exchange(overrides: Partial<LlmExchange> = {}): LlmExchange {
	return {
		format: 'anthropic-messages',
		stream: false,
		messages: [],
		...overrides,
	};
}

function text(role: LlmMessage['role'], value: string): LlmMessage {
	return { role, parts: [{ type: 'text', text: value }] };
}

describe('previousCall', () => {
	const a1 = request('a1', 'anthropic', 1000);
	const o1 = request('o1', 'openai', 1500);
	const a2 = request('a2', 'anthropic', 2000);
	const a3 = request('a3', 'anthropic', 3000);

	it('picks the latest earlier call to the same upstream', () => {
		expect(previousCall([a3, o1, a1, a2], a3)?.id).toBe('a2');
	});

	it('skips calls to other upstreams', () => {
		expect(previousCall([a1, o1, a2], a2)?.id).toBe('a1');
	});

	it('finds nothing for the first call', () => {
		expect(previousCall([a1, o1, a2], a1)).toBeUndefined();
		expect(previousCall([a1, o1, a2], o1)).toBeUndefined();
	});
});

describe('fieldChanges', () => {
	it('lists only the fields that differ', () => {
		const other = exchange({ model: 'model-a', stopReason: 'end_turn' });
		const call = exchange({
			model: 'model-b',
			stream: true,
			stopReason: 'end_turn',
		});
		expect(fieldChanges(other, call)).toEqual([
			{ label: 'model', other: 'model-a', call: 'model-b' },
			{ label: 'stream', other: 'not streamed', call: 'streamed' },
		]);
	});

	it('shows a missing value as a dash', () => {
		expect(
			fieldChanges(exchange(), exchange({ stopReason: 'tool_use' })),
		).toEqual([{ label: 'stop', other: '-', call: 'tool_use' }]);
	});

	it('is empty for the same call', () => {
		const llm = exchange({ model: 'model-a' });
		expect(fieldChanges(llm, llm)).toEqual([]);
	});
});

describe('usageChanges', () => {
	it('pairs every count either call reported', () => {
		expect(
			usageChanges(
				{ input: 100, output: 20 },
				{ input: 150, cacheRead: 80 },
			),
		).toEqual([
			{ label: 'in', other: 100, call: 150 },
			{ label: 'out', other: 20, call: undefined },
			{ label: 'cache read', other: undefined, call: 80 },
		]);
	});

	it('is empty without usage', () => {
		expect(usageChanges(undefined, undefined)).toEqual([]);
	});
});

describe('formatDelta', () => {
	it('signs the difference', () => {
		expect(formatDelta({ label: 'in', other: 100, call: 1366 })).toBe(
			`+${(1266).toLocaleString()}`,
		);
		expect(formatDelta({ label: 'in', other: 100, call: 88 })).toBe('-12');
		expect(formatDelta({ label: 'in', other: 5, call: 5 })).toBe('±0');
	});

	it('is empty when one side is missing', () => {
		expect(formatDelta({ label: 'in', call: 5 })).toBe('');
	});
});

describe('textChanges', () => {
	it('is undefined for the same text', () => {
		expect(textChanges('a\nb', 'a\nb')).toBeUndefined();
		expect(textChanges(undefined, undefined)).toBeUndefined();
	});

	it('marks removed and added lines', () => {
		const changes = textChanges('keep\nold\n', 'keep\nnew\n');
		expect(
			changes?.map(({ value, added, removed }) => ({
				value,
				added,
				removed,
			})),
		).toEqual([
			{ value: 'keep\n', added: false, removed: false },
			{ value: 'old\n', added: false, removed: true },
			{ value: 'new\n', added: true, removed: false },
		]);
	});

	it('treats a missing prompt as empty', () => {
		const changes = textChanges(undefined, 'You are terse.');
		expect(changes?.map((change) => change.added)).toEqual([true]);
	});
});

describe('toolChanges', () => {
	it('lists added, removed and changed tools by name', () => {
		const other = exchange({
			tools: [
				{ name: 'read', description: 'Read a file' },
				{ name: 'grep' },
			],
		});
		const call = exchange({
			tools: [
				{ name: 'read', description: 'Read a file, or part of one' },
				{ name: 'write' },
			],
		});
		expect(toolChanges(other, call)).toEqual({
			added: ['write'],
			removed: ['grep'],
			changed: ['read'],
		});
	});

	it('is undefined when the tools are the same, in any order', () => {
		const other = exchange({ tools: [{ name: 'a' }, { name: 'b' }] });
		const call = exchange({ tools: [{ name: 'b' }, { name: 'a' }] });
		expect(toolChanges(other, call)).toBeUndefined();
		expect(toolChanges(exchange(), exchange())).toBeUndefined();
	});
});

describe('messageChanges', () => {
	const hi = text('user', 'hi');
	const hello = text('assistant', 'hello');
	const more = text('user', 'tell me more');

	it('finds the messages a follow-up call adds', () => {
		expect(messageChanges([hi], [hi, hello, more])).toEqual({
			same: 1,
			other: [],
			call: [hello, more],
		});
	});

	it('finds where a rewritten conversation starts to differ', () => {
		const summary = text('user', 'summary of the chat so far');
		expect(messageChanges([hi, hello, more], [hi, summary])).toEqual({
			same: 1,
			other: [hello, more],
			call: [summary],
		});
	});

	it('compares every part of a message', () => {
		const call: LlmMessage = {
			role: 'assistant',
			parts: [
				{ type: 'tool_call', id: 't1', name: 'read', input: { a: 1 } },
			],
		};
		const changed: LlmMessage = {
			role: 'assistant',
			parts: [
				{ type: 'tool_call', id: 't1', name: 'read', input: { a: 2 } },
			],
		};
		expect(messageChanges([call], [changed]).same).toBe(0);
		expect(messageChanges([call], [structuredClone(call)]).same).toBe(1);
	});

	it('reports identical conversations as all the same', () => {
		expect(messageChanges([hi, hello], [hi, hello])).toEqual({
			same: 2,
			other: [],
			call: [],
		});
	});
});

describe('messageSummary', () => {
	const m = text('user', 'x');

	it('describes each way two conversations relate', () => {
		expect(messageSummary({ same: 4, other: [], call: [] })).toBe(
			'All 4 messages the same.',
		);
		expect(messageSummary({ same: 1, other: [], call: [] })).toBe(
			'The one message is the same.',
		);
		expect(messageSummary({ same: 3, other: [], call: [m, m] })).toBe(
			'First 3 the same, 2 messages added.',
		);
		expect(messageSummary({ same: 3, other: [m], call: [] })).toBe(
			'First 3 the same, 1 message left out.',
		);
		expect(messageSummary({ same: 0, other: [m], call: [m, m] })).toBe(
			'Different from the first message, then 1 in the other call and 2 in this one.',
		);
	});
});

describe('diffRows', () => {
	const lines = (from: number, to: number) =>
		Array.from({ length: to - from + 1 }, (_, i) => `l${from + i}\n`).join(
			'',
		);

	it('folds a long unchanged run between changes, keeping context', () => {
		const rows = diffRows(
			[
				{ value: 'a\n', added: false, removed: true, count: 1 },
				{
					value: lines(1, 10),
					added: false,
					removed: false,
					count: 10,
				},
				{ value: 'b\n', added: true, removed: false, count: 1 },
			],
			2,
		);
		expect(rows).toEqual([
			{ kind: 'removed', text: 'a' },
			{ kind: 'same', text: 'l1' },
			{ kind: 'same', text: 'l2' },
			{ kind: 'fold', lines: ['l3', 'l4', 'l5', 'l6', 'l7', 'l8'] },
			{ kind: 'same', text: 'l9' },
			{ kind: 'same', text: 'l10' },
			{ kind: 'added', text: 'b' },
		]);
	});

	it('keeps no context before the first change or after the last', () => {
		const rows = diffRows(
			[
				{ value: lines(1, 5), added: false, removed: false, count: 5 },
				{ value: 'x\n', added: true, removed: false, count: 1 },
				{ value: lines(6, 10), added: false, removed: false, count: 5 },
			],
			1,
		);
		expect(rows).toEqual([
			{ kind: 'fold', lines: ['l1', 'l2', 'l3', 'l4'] },
			{ kind: 'same', text: 'l5' },
			{ kind: 'added', text: 'x' },
			{ kind: 'same', text: 'l6' },
			{ kind: 'fold', lines: ['l7', 'l8', 'l9', 'l10'] },
		]);
	});

	it('does not fold a run that is barely longer than its context', () => {
		const rows = diffRows(
			[
				{ value: 'a\n', added: true, removed: false, count: 1 },
				{ value: lines(1, 3), added: false, removed: false, count: 3 },
				{ value: 'b\n', added: true, removed: false, count: 1 },
			],
			1,
		);
		expect(rows.map((row) => row.kind)).toEqual([
			'added',
			'same',
			'same',
			'same',
			'added',
		]);
	});

	it('keeps a last line that has no newline', () => {
		expect(
			diffRows([{ value: 'end', added: true, removed: false, count: 1 }]),
		).toEqual([{ kind: 'added', text: 'end' }]);
	});
});

describe('prettyBody', () => {
	it('sorts keys at every level and indents', () => {
		expect(prettyBody('{"b":1,"a":{"d":[{"z":1,"y":2}],"c":null}}')).toBe(
			`${JSON.stringify({ a: { c: null, d: [{ y: 2, z: 1 }] }, b: 1 }, null, 2)}\n`,
		);
	});

	it('keeps a body that is not JSON as it is', () => {
		expect(prettyBody('data: {"x":1}\n\n')).toBe('data: {"x":1}\n\n');
		expect(prettyBody('plain')).toBe('plain\n');
	});
});

describe('bodyChanges', () => {
	it('finds no change when only key order or spacing differ', () => {
		expect(bodyChanges('{"a":1,"b":2}', '{ "b": 2, "a": 1 }')).toBe('same');
	});

	it('shows a changed setting as one removed and one added line', () => {
		const changes = bodyChanges(
			'{"max_tokens":512,"model":"m"}',
			'{"max_tokens":1024,"model":"m"}',
		);
		expect(Array.isArray(changes) && changes.map((c) => c.value)).toEqual([
			'{\n',
			'  "max_tokens": 512,\n',
			'  "max_tokens": 1024,\n',
			'  "model": "m"\n}\n',
		]);
	});

	it('gives up on a diff that takes too long', () => {
		const big = (seed: number) =>
			Array.from(
				{ length: 20000 },
				(_, i) => `${(i * seed) % 9973}`,
			).join('\n');
		expect(bodyChanges(big(7), big(13), 1)).toBe('too-slow');
	});
});
