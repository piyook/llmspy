import { describe, expect, it } from 'vitest';
import { parseSse, parseSseJson } from './sse.js';

describe('parseSse', () => {
	it('splits events and reads their names', () => {
		const text = 'event: ping\ndata: {}\n\ndata: second\n\n';
		expect(parseSse(text)).toEqual([
			{ event: 'ping', data: '{}' },
			{ event: 'message', data: 'second' },
		]);
	});

	it('joins data lines and handles CRLF and CR line breaks', () => {
		expect(parseSse('data: a\r\ndata: b\r\n\r\ndata: c\r\r')).toEqual([
			{ event: 'message', data: 'a\nb' },
			{ event: 'message', data: 'c' },
		]);
	});

	it('skips comments and drops only one space after the colon', () => {
		expect(
			parseSse(': keep-alive\ndata:  two spaces\ndata:none\n\n'),
		).toEqual([{ event: 'message', data: ' two spaces\nnone' }]);
	});

	it('skips blocks without data', () => {
		expect(parseSse('event: empty\n\n')).toEqual([]);
	});

	it('drops a last event whose blank line never arrived', () => {
		expect(parseSse('data: 1\n\ndata: 2\n')).toEqual([
			{ event: 'message', data: '1' },
		]);
		expect(parseSse('data: 1\n\ndata: {"cut')).toEqual([
			{ event: 'message', data: '1' },
		]);
	});
});

describe('parseSseJson', () => {
	it('parses JSON data and skips the rest', () => {
		expect(parseSseJson('data: {"a":1}\n\ndata: [DONE]\n\n')).toEqual([
			{ a: 1 },
		]);
	});
});
