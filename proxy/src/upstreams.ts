const DEFAULT_UPSTREAMS: Record<string, string> = {
	anthropic: 'https://api.anthropic.com',
	openai: 'https://api.openai.com',
};

/** First path segments that LLMSpy's own endpoints and the built UI use. */
const RESERVED_NAMES = new Set(['api', 'assets', 'events', 'ping']);
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Builds the upstream map from the defaults plus `LLMSPY_UPSTREAMS`,
 * a comma-separated list of `name=url` (e.g. `ollama=http://localhost:11434`).
 * A name that matches a default replaces it.
 */
export function parseUpstreams(spec?: string): Map<string, URL> {
	const upstreams = new Map<string, URL>();
	for (const [name, url] of Object.entries(DEFAULT_UPSTREAMS)) {
		upstreams.set(name, new URL(url));
	}

	for (const entry of (spec ?? '').split(',')) {
		const trimmed = entry.trim();
		if (!trimmed) continue;

		const eq = trimmed.indexOf('=');
		if (eq < 1) {
			throw new Error(
				`LLMSPY_UPSTREAMS: expected name=url, got "${trimmed}"`,
			);
		}
		const name = trimmed.slice(0, eq).trim().toLowerCase();
		const rawUrl = trimmed.slice(eq + 1).trim();

		if (!NAME_PATTERN.test(name) || RESERVED_NAMES.has(name)) {
			throw new Error(
				`LLMSPY_UPSTREAMS: "${name}" is not a usable name (lowercase letters, digits and dashes; not ${[...RESERVED_NAMES].join(', ')})`,
			);
		}

		let url: URL;
		try {
			url = new URL(rawUrl);
		} catch {
			throw new Error(
				`LLMSPY_UPSTREAMS: "${rawUrl}" for ${name} is not a valid URL`,
			);
		}
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			throw new Error(
				`LLMSPY_UPSTREAMS: ${name} must use http or https, got ${url.protocol}`,
			);
		}
		upstreams.set(name, url);
	}

	return upstreams;
}

export interface Route {
	provider: string;
	target: URL;
}

/**
 * Maps `/<name>/rest?query` to the upstream `name`, appending `rest?query`
 * to the upstream's base path. Returns undefined when no upstream matches.
 */
export function resolveRoute(
	requestUrl: string,
	upstreams: Map<string, URL>,
): Route | undefined {
	const match = /^\/([^/?]+)([^?]*)(\?.*)?$/.exec(requestUrl);
	if (!match) return undefined;

	const [, provider, rest, query] = match;
	const base = upstreams.get(provider);
	if (!base) return undefined;

	// Set the parts rather than resolving a relative URL, so a path such as
	// `//other.host/x` stays a path on this upstream.
	const target = new URL(base.origin);
	target.pathname = base.pathname.replace(/\/$/, '') + (rest || '/');
	target.search = query ?? '';
	return { provider, target };
}
