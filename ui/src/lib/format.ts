export function formatTime(timestamp: string): string {
	return new Date(timestamp).toLocaleTimeString();
}

export function formatLatency(ms: number): string {
	return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

/** `1234` -> `1.2k`; `?` when the provider did not report it. */
export function formatTokens(count?: number): string {
	if (count === undefined) return '?';
	return count < 1000 ? `${count}` : `${(count / 1000).toFixed(1)}k`;
}

export function statusClass(status: number): string {
	return status >= 200 && status < 300 ? 'status-success' : 'status-error';
}

/** Pretty-prints a JSON body; anything else (an SSE stream, plain text) is returned as is. */
export function formatBody(body: string): string {
	try {
		return JSON.stringify(JSON.parse(body), null, 2);
	} catch {
		return body;
	}
}
