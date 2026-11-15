export function formatTime(timestamp: string): string {
	return new Date(timestamp).toLocaleTimeString();
}

export function formatLatency(ms: number): string {
	return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

/** Time so far for a call still running, in whole seconds: `0s`, `42s`, `3m 05s`. */
export function formatElapsed(ms: number): string {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const rest = String(seconds % 60).padStart(2, '0');
	return `${Math.floor(seconds / 60)}m ${rest}s`;
}

/** `1234` -> `1.2k`, `2500000` -> `2.5M`; `?` when the provider did not report it. */
export function formatTokens(count?: number): string {
	if (count === undefined) return '?';
	if (count < 1000) return `${count}`;
	if (count < 999_950) return `${(count / 1000).toFixed(1)}k`;
	return `${(count / 1_000_000).toFixed(1)}M`;
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
