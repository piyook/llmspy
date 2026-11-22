import { randomUUID } from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';
import * as zlib from 'node:zlib';
import { isEventStream } from './parsers/sse.js';
import type { CapturedRequest, Headers } from './types.js';
import type { Route } from './upstreams.js';

/** Headers that apply to one connection and must not be forwarded (RFC 9110 7.6.1). */
const HOP_BY_HOP = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'proxy-connection',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
]);

const SECRET_HEADERS = new Set(['authorization', 'x-api-key']);

export function stripHopByHop(headers: http.IncomingHttpHeaders): Headers {
	const listed = String(headers.connection ?? '')
		.split(',')
		.map((token) => token.trim().toLowerCase())
		.filter(Boolean);

	const result: Headers = {};
	for (const [name, value] of Object.entries(headers)) {
		if (value === undefined) continue;
		if (HOP_BY_HOP.has(name) || listed.includes(name)) continue;
		result[name] = value;
	}
	return result;
}

/**
 * Masks a secret, keeping an auth scheme such as `Bearer ` and the last
 * four characters when the secret is long enough for that to be safe.
 */
export function maskSecret(value: string): string {
	const space = value.indexOf(' ');
	const scheme = space > 0 ? value.slice(0, space + 1) : '';
	const secret = value.slice(scheme.length);
	const tail = secret.length > 8 ? secret.slice(-4) : '';
	return `${scheme}••••${tail}`;
}

export function maskHeaders(headers: Headers): Headers {
	const result: Headers = {};
	for (const [name, value] of Object.entries(headers)) {
		if (!SECRET_HEADERS.has(name)) {
			result[name] = value;
		} else {
			result[name] = Array.isArray(value)
				? value.map(maskSecret)
				: maskSecret(value);
		}
	}
	return result;
}

function decompress(data: Buffer, encoding: string): Buffer {
	// Flush rather than fail at the end, so a stream cut short still shows
	// what arrived.
	switch (encoding) {
		case 'gzip':
		case 'x-gzip':
			return zlib.gunzipSync(data, {
				finishFlush: zlib.constants.Z_SYNC_FLUSH,
			});
		case 'deflate':
			return zlib.inflateSync(data, {
				finishFlush: zlib.constants.Z_SYNC_FLUSH,
			});
		case 'br':
			return zlib.brotliDecompressSync(data, {
				finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH,
			});
		case 'zstd':
			return zlib.zstdDecompressSync(data);
		default:
			throw new Error(`unsupported content-encoding "${encoding}"`);
	}
}

/** Decompresses a body per its `content-encoding` and decodes it as UTF-8. */
export function decodeBody(
	raw: Buffer,
	contentEncoding: string | string[] | undefined,
): string {
	if (raw.length === 0) return '';

	const encodings = String(contentEncoding ?? '')
		.split(',')
		.map((encoding) => encoding.trim().toLowerCase())
		.filter((encoding) => encoding && encoding !== 'identity');

	try {
		let data = raw;
		// Encodings are listed in the order they were applied; undo them in reverse.
		for (const encoding of encodings.reverse()) {
			data = decompress(data, encoding);
		}
		return data.toString('utf8');
	} catch (error) {
		return `[LLMSpy could not decode this body: ${(error as Error).message}]`;
	}
}

/** How often, at most, a streamed reply is passed on while it arrives. */
const LIVE_INTERVAL_MS = 500;

/**
 * Whether the reply so far is worth passing on while it arrives: only an
 * uncompressed event stream. A JSON body cut short can not be read, and a
 * compressed one would have to be decompressed from the start each time.
 */
export function isLiveStream(headers: http.IncomingHttpHeaders): boolean {
	const encoding = String(headers['content-encoding'] ?? '')
		.trim()
		.toLowerCase();
	return (
		isEventStream(headers['content-type']) &&
		(encoding === '' || encoding === 'identity')
	);
}

/**
 * Why a request never reached the upstream, as told to the app and stored.
 * A host with several addresses (`localhost`: ::1 and 127.0.0.1) fails with
 * an AggregateError whose own message is empty, so its parts are used.
 * A refused connection most often means a local server that is not started.
 */
export function failureReason(
	error: NodeJS.ErrnoException & { errors?: unknown[] },
): string {
	const parts = (error.errors ?? [])
		.map((part) => (part instanceof Error ? part.message : ''))
		.filter(Boolean);
	const reason =
		error.message || parts.join(', ') || error.code || 'unknown error';
	return error.code === 'ECONNREFUSED'
		? `${reason} (nothing accepted the connection: is the server running, on that port?)`
		: reason;
}

export interface CaptureHandlers {
	/**
	 * The exchange so far, while it runs: once the request body has arrived,
	 * again when the response headers arrive (`response.body` is then still
	 * empty), and for an uncompressed event stream every half second or so
	 * with the reply so far. `timings.end` is not set yet.
	 */
	onUpdate: (captured: CapturedRequest) => void;
	/** The whole exchange, once, when the response has been sent or it failed. */
	onDone: (captured: CapturedRequest) => void;
}

/**
 * Forwards one request to `target` and streams the response back unchanged,
 * chunk by chunk, keeping a copy of both bodies. Each handler gets the same
 * record, updated as the exchange goes on.
 *
 * It does not care how the request arrived, so any front end (base-URL
 * routes now, an intercepting proxy later) can hand requests to it.
 */
export function forwardAndCapture(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	{ project, provider, target }: Route,
	{ onUpdate, onDone }: CaptureHandlers,
): void {
	const start = Date.now();
	const captured: CapturedRequest = {
		id: randomUUID(),
		timestamp: new Date(start).toISOString(),
		project,
		provider,
		host: target.host,
		protocol: target.protocol,
		method: req.method ?? 'GET',
		path: target.pathname + target.search,
		headers: maskHeaders(stripHopByHop(req.headers)),
		body: '',
		timings: { start },
	};

	const requestChunks: Buffer[] = [];
	const responseChunks: Buffer[] = [];
	let upstreamRes: http.IncomingMessage | undefined;
	let finished = false;
	let liveTimer: NodeJS.Timeout | undefined;

	const finish = (error?: string): void => {
		if (finished) return;
		finished = true;
		clearTimeout(liveTimer);

		const end = Date.now();
		captured.timings.end = end;
		captured.latency = end - start;
		captured.body = decodeBody(
			Buffer.concat(requestChunks),
			req.headers['content-encoding'],
		);
		if (upstreamRes) {
			captured.response = {
				status: upstreamRes.statusCode ?? 0,
				headers: stripHopByHop(upstreamRes.headers),
				body: decodeBody(
					Buffer.concat(responseChunks),
					upstreamRes.headers['content-encoding'],
				),
			};
		}
		if (error) captured.error = error;
		onDone(captured);
	};

	const headers = stripHopByHop(req.headers);
	headers.host = target.host;
	const transport = target.protocol === 'https:' ? https : http;
	const upstreamReq = transport.request(target, {
		method: req.method,
		headers,
	});

	req.on('data', (chunk: Buffer) => requestChunks.push(chunk));
	req.on('end', () => {
		if (finished) return;
		captured.body = decodeBody(
			Buffer.concat(requestChunks),
			req.headers['content-encoding'],
		);
		onUpdate(captured);
	});
	req.pipe(upstreamReq);

	upstreamReq.on('response', (response) => {
		upstreamRes = response;
		captured.timings.firstByte = Date.now();
		res.writeHead(
			response.statusCode ?? 502,
			stripHopByHop(response.headers),
		);
		const live = {
			status: response.statusCode ?? 0,
			headers: stripHopByHop(response.headers),
			body: '',
		};
		captured.response = live;
		onUpdate(captured);

		// The reply so far, on a timer, so a chunk is passed through to the
		// client before any of this work is done.
		const sendLive = (): void => {
			liveTimer = undefined;
			if (finished) return;
			live.body = Buffer.concat(responseChunks).toString('utf8');
			onUpdate(captured);
		};
		const isLive = isLiveStream(response.headers);
		response.on('data', (chunk: Buffer) => {
			responseChunks.push(chunk);
			if (!isLive) return;
			captured.timings.lastData = Date.now();
			if (!liveTimer) liveTimer = setTimeout(sendLive, LIVE_INTERVAL_MS);
		});
		response.on('error', (error) => {
			finish(`Upstream response failed: ${error.message}`);
			res.destroy();
		});
		response.pipe(res);
	});

	upstreamReq.on('error', (error) => {
		const reason = failureReason(error);
		finish(`Upstream request failed: ${reason}`);
		if (res.headersSent) {
			res.destroy();
		} else {
			res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
			res.end(`LLMSpy could not reach ${target.origin}: ${reason}`);
		}
	});

	res.on('finish', () => finish());
	res.on('close', () => {
		if (res.writableFinished) return;
		finish('Client closed the connection before the response finished');
		upstreamReq.destroy();
	});
}
