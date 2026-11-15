import * as zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
	decodeBody,
	isLiveStream,
	maskHeaders,
	maskSecret,
	stripHopByHop,
} from './capture.js';

describe('isLiveStream', () => {
	it('passes on an uncompressed event stream while it arrives', () => {
		expect(
			isLiveStream({
				'content-type': 'text/event-stream; charset=utf-8',
			}),
		).toBe(true);
		expect(
			isLiveStream({
				'content-type': 'text/event-stream',
				'content-encoding': 'identity',
			}),
		).toBe(true);
	});

	it('waits for the end of a compressed stream or a JSON body', () => {
		expect(
			isLiveStream({
				'content-type': 'text/event-stream',
				'content-encoding': 'gzip',
			}),
		).toBe(false);
		expect(isLiveStream({ 'content-type': 'application/json' })).toBe(
			false,
		);
	});
});

describe('maskSecret', () => {
	it('keeps the last four characters of a long key', () => {
		expect(maskSecret('sk-ant-test-1234567890abcd')).toBe('••••abcd');
	});

	it('keeps the auth scheme', () => {
		expect(maskSecret('Bearer sk-test-1234567890wxyz')).toBe(
			'Bearer ••••wxyz',
		);
	});

	it('hides a short secret completely', () => {
		expect(maskSecret('short')).toBe('••••');
	});
});

describe('maskHeaders', () => {
	it('masks only authorization and x-api-key', () => {
		expect(
			maskHeaders({
				authorization: 'Bearer sk-test-1234567890wxyz',
				'x-api-key': 'sk-ant-test-1234567890abcd',
				'content-type': 'application/json',
			}),
		).toEqual({
			authorization: 'Bearer ••••wxyz',
			'x-api-key': '••••abcd',
			'content-type': 'application/json',
		});
	});
});

describe('stripHopByHop', () => {
	it('drops hop-by-hop headers and those named in Connection', () => {
		expect(
			stripHopByHop({
				connection: 'keep-alive, x-trace',
				'keep-alive': 'timeout=5',
				'transfer-encoding': 'chunked',
				'x-trace': '1',
				'content-type': 'application/json',
			}),
		).toEqual({ 'content-type': 'application/json' });
	});
});

describe('decodeBody', () => {
	const text = '{"text":"héllo wörld ✓"}';

	it('decodes plain UTF-8, including characters split across chunks', () => {
		const bytes = Buffer.from(text);
		const split = Buffer.concat([
			bytes.subarray(0, 12),
			bytes.subarray(12),
		]);
		expect(decodeBody(split, undefined)).toBe(text);
	});

	it.each([
		['gzip', zlib.gzipSync],
		['deflate', zlib.deflateSync],
		['br', zlib.brotliCompressSync],
		['zstd', zlib.zstdCompressSync],
	] as const)('decompresses %s', (encoding, compress) => {
		expect(decodeBody(compress(Buffer.from(text)), encoding)).toBe(text);
	});

	it('undoes several encodings in reverse order', () => {
		const data = zlib.brotliCompressSync(zlib.gzipSync(Buffer.from(text)));
		expect(decodeBody(data, 'gzip, br')).toBe(text);
	});

	it('shows what arrived of a truncated gzip stream', () => {
		const long = 'data: chunk\n\n'.repeat(2000);
		const gz = zlib.gzipSync(Buffer.from(long));
		const decoded = decodeBody(gz.subarray(0, gz.length - 20), 'gzip');
		expect(long.startsWith(decoded)).toBe(true);
		expect(decoded.length).toBeGreaterThan(0);
	});

	it('explains a body it cannot decode', () => {
		expect(decodeBody(Buffer.from('abc'), 'compress')).toMatch(
			/could not decode.*unsupported content-encoding "compress"/,
		);
	});
});
