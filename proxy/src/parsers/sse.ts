export interface SseEvent {
	/** The `event:` field, or `message` when there is none. */
	event: string;
	data: string;
}

/**
 * Splits a Server-Sent Events body into events, following the WHATWG rules:
 * `data:` lines join with newlines, comments are skipped, one space after the
 * colon is dropped. An event without its closing blank line (a stream cut
 * short) is dropped, as a browser would.
 */
export function parseSse(text: string): SseEvent[] {
	const events: SseEvent[] = [];
	const lines = text.split(/\r\n|\r|\n/);
	// The last piece follows the last line break, so it is empty or a line cut short.
	lines.pop();

	let event = '';
	let data: string[] = [];
	for (const line of lines) {
		if (line === '') {
			if (data.length > 0) {
				events.push({
					event: event || 'message',
					data: data.join('\n'),
				});
			}
			event = '';
			data = [];
			continue;
		}
		const field = splitField(line);
		if (field?.name === 'event') event = field.value;
		else if (field?.name === 'data') data.push(field.value);
	}
	return events;
}

/** A field line as name and value; a comment line is undefined. */
function splitField(line: string): { name: string; value: string } | undefined {
	if (line.startsWith(':')) return undefined;
	const colon = line.indexOf(':');
	if (colon === -1) return { name: line, value: '' };
	const value = line.slice(colon + 1);
	return {
		name: line.slice(0, colon),
		value: value.startsWith(' ') ? value.slice(1) : value,
	};
}

/**
 * The `data` of each event, parsed as JSON. Events whose data is not JSON,
 * such as OpenAI's closing `[DONE]`, are skipped.
 */
export function parseSseJson(text: string): unknown[] {
	const result: unknown[] = [];
	for (const { data } of parseSse(text)) {
		try {
			result.push(JSON.parse(data));
		} catch {
			// Not JSON: nothing to read from it.
		}
	}
	return result;
}
