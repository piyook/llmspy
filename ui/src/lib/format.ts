export function formatTime(timestamp: string): string {
	return new Date(timestamp).toLocaleTimeString();
}

export function formatLatency(ms: number): string {
	return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
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
