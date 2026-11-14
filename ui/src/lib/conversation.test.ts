import { describe, expect, it } from 'vitest';
import { preview, toolNames, usageSummary } from './conversation.js';
import type { LlmExchange, LlmMessage } from './types.js';

const call = (id: string, name: string) =>
	({ type: 'tool_call', id, name, input: {} }) as const;

describe('toolNames', () => {
	it('maps call ids to names from the messages and the reply', () => {
		const llm: LlmExchange = {
			format: 'anthropic-messages',
			stream: false,
			messages: [
				{ role: 'user', parts: [{ type: 'text', text: 'hi' }] },
				{
					role: 'assistant',
					parts: [call('a', 'read_file'), call('b', 'grep')],
				},
			],
			output: { role: 'assistant', parts: [call('c', 'write_file')] },
		};
		expect(toolNames(llm)).toEqual(
			new Map([
				['a', 'read_file'],
				['b', 'grep'],
				['c', 'write_file'],
			]),
		);
	});

	it('reads the messages alone when there is no reply yet', () => {
		const llm: LlmExchange = {
			format: 'openai-chat',
			stream: false,
			messages: [{ role: 'assistant', parts: [call('a', 'grep')] }],
		};
		expect(toolNames(llm)).toEqual(new Map([['a', 'grep']]));
	});
});

describe('preview', () => {
	const names = new Map([['a', 'read_file']]);
	const message = (parts: LlmMessage['parts']): LlmMessage => ({
		role: 'assistant',
		parts,
	});

	it('uses the first part that has a line, skipping the rest', () => {
		const m = message([
			{ type: 'thinking', text: 'hmm' },
			{ type: 'text', text: '' },
			{ type: 'tool_call', id: 'a', name: 'read_file', input: {} },
			{ type: 'text', text: 'later' },
		]);
		expect(preview(m, names)).toBe('tool call: read_file');
	});

	it('names the tool a result belongs to', () => {
		const result = (id: string) =>
			message([{ type: 'tool_result', id, content: 'ok' }]);
		expect(preview(result('a'), names)).toBe('result of read_file');
		expect(preview(result('z'), names)).toBe('result of unknown tool');
	});

	it('shows images and leaves out parts it has no line for', () => {
		expect(preview(message([{ type: 'image' }]), names)).toBe('[image]');
		expect(preview(message([{ type: 'other', raw: {} }]), names)).toBe('');
		expect(preview(message([]), names)).toBe('');
	});

	it('folds whitespace onto one line and cuts it at 80 characters', () => {
		const text = (t: string) => message([{ type: 'text', text: t }]);
		expect(preview(text('  one\n\ttwo   three '), names)).toBe(
			'one two three',
		);
		expect(preview(text('x'.repeat(80)), names)).toBe('x'.repeat(80));
		expect(preview(text('x'.repeat(81)), names)).toBe(`${'x'.repeat(80)}…`);
	});
});

describe('usageSummary', () => {
	it('lists the counts that were reported, in a fixed order', () => {
		expect(
			usageSummary({
				reasoning: 7,
				output: 340,
				input: 12,
				cacheRead: 0,
			}),
		).toEqual(['in 12', 'out 340', 'cache read 0', 'reasoning 7']);
	});

	it('formats large counts for the locale', () => {
		expect(usageSummary({ input: 1234 })).toEqual([
			`in ${(1234).toLocaleString()}`,
		]);
	});

	it('is empty without usage', () => {
		expect(usageSummary(undefined)).toEqual([]);
		expect(usageSummary({})).toEqual([]);
	});
});
