import type { LlmExchange } from './parsers/types.js';
import type { CapturedRequest, Headers, Timings } from './types.js';

/**
 * The `llm-capture` format, version 1: captured calls in a file other tools
 * can read. The spec is `docs/capture-format.md`.
 */
export const CAPTURE_FORMAT = 'llm-capture';
export const CAPTURE_VERSION = 1;

interface CaptureHttpMessage {
	headers: Headers;
	body: string;
}

export interface CaptureCall {
	id: string;
	timestamp: string;
	project?: string;
	upstream?: string;
	http: {
		request: CaptureHttpMessage & { method: string; url: string };
		response?: CaptureHttpMessage & { status: number };
		timings: Timings;
		error?: string;
	};
	llm?: LlmExchange;
}

/** Credentials, which an export leaves out entirely rather than masked. */
const CREDENTIAL_HEADERS = new Set([
	'authorization',
	'x-api-key',
	'proxy-authorization',
	'cookie',
	'set-cookie',
]);
const CREDENTIAL_NAME = /key|token|secret/;

/**
 * Headers that describe how the message reached LLMSpy, not the message: the
 * bodies are stored decompressed, and `host` is LLMSpy's own.
 */
const TRANSPORT_HEADERS = new Set([
	'host',
	'content-length',
	'content-encoding',
]);

function exportHeaders(headers: Headers): Headers {
	const result: Headers = {};
	for (const [name, value] of Object.entries(headers)) {
		const lower = name.toLowerCase();
		if (CREDENTIAL_HEADERS.has(lower) || CREDENTIAL_NAME.test(lower))
			continue;
		if (TRANSPORT_HEADERS.has(lower)) continue;
		result[lower] = value;
	}
	return result;
}

/**
 * The scheme a call was sent with. Calls captured before `protocol` was kept
 * take it from the upstream of the same name if that still points at the
 * same host, else `https:`.
 */
function protocolOf(
	captured: CapturedRequest,
	upstreams: Map<string, URL>,
): string {
	if (captured.protocol) return captured.protocol;
	const upstream = upstreams.get(captured.provider);
	return upstream?.host === captured.host ? upstream.protocol : 'https:';
}

/** A finished call in the capture format; undefined while it is running. */
export function toCaptureCall(
	captured: CapturedRequest,
	upstreams: Map<string, URL>,
): CaptureCall | undefined {
	if (captured.timings.end === undefined) return undefined;
	const { response } = captured;
	return {
		id: captured.id,
		timestamp: captured.timestamp,
		project: captured.project,
		upstream: captured.provider,
		http: {
			request: {
				method: captured.method,
				url: `${protocolOf(captured, upstreams)}//${captured.host}${captured.path}`,
				headers: exportHeaders(captured.headers),
				body: captured.body,
			},
			response: response && {
				status: response.status,
				headers: exportHeaders(response.headers),
				body: response.body,
			},
			timings: captured.timings,
			error: captured.error,
		},
		llm: captured.llm,
	};
}

/** Indents every line after the first, to nest a pretty-printed value. */
function nest(json: string, indent: string): string {
	return json.replaceAll('\n', `\n${indent}`);
}

/**
 * The text of a capture file, a piece at a time: the calls are converted as
 * they are read, so a large export is never one string in memory. `calls`
 * must be oldest first; running calls are left out.
 */
export function* captureFile(
	calls: Iterable<CapturedRequest>,
	{
		createdAt,
		createdBy,
		upstreams,
	}: { createdAt: Date; createdBy: string; upstreams: Map<string, URL> },
): Generator<string> {
	const header = {
		format: CAPTURE_FORMAT,
		version: CAPTURE_VERSION,
		createdAt: createdAt.toISOString(),
		createdBy,
	};
	// The header without its closing brace, so `calls` can follow it.
	yield `${JSON.stringify(header, null, 2).slice(0, -2)},\n  "calls": [`;
	let first = true;
	for (const captured of calls) {
		const call = toCaptureCall(captured, upstreams);
		if (!call) continue;
		yield `${first ? '' : ','}\n    ${nest(JSON.stringify(call, null, 2), '    ')}`;
		first = false;
	}
	yield first ? ']\n}\n' : '\n  ]\n}\n';
}

/** `llmspy-<project or all>-<YYYYMMDD-HHmm>.capture.json`, in local time. */
export function captureFileName(project: string | undefined, at: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	const date = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}`;
	const time = `${pad(at.getHours())}${pad(at.getMinutes())}`;
	return `llmspy-${project ?? 'all'}-${date}-${time}.capture.json`;
}
