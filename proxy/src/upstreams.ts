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
 * A name that matches a default replaces it; a name given twice is an error,
 * since only one of the two could be kept.
 */
export function parseUpstreams(spec?: string): Map<string, URL> {
	const upstreams = new Map<string, URL>();
	for (const [name, url] of Object.entries(DEFAULT_UPSTREAMS)) {
		upstreams.set(name, new URL(url));
	}
	const given = new Set<string>();

	for (const entry of (spec ?? '').split(',')) {
		const trimmed = entry.trim();
		if (!trimmed) continue;

		const [name, url] = parseEntry(trimmed);
		if (given.has(name)) {
			throw new Error(
				`LLMSPY_UPSTREAMS: "${name}" is given more than once; each upstream needs its own name`,
			);
		}
		given.add(name);
		upstreams.set(name, url);
	}

	return upstreams;
}

/** One trimmed `name=url` entry of `LLMSPY_UPSTREAMS`, checked. */
function parseEntry(entry: string): [string, URL] {
	const eq = entry.indexOf('=');
	if (eq < 1) {
		throw new Error(`LLMSPY_UPSTREAMS: expected name=url, got "${entry}"`);
	}
	const name = entry.slice(0, eq).trim().toLowerCase();
	const rawUrl = entry.slice(eq + 1).trim();

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
	return [name, url];
}

export interface UpstreamInfo {
	name: string;
	target: string;
}

/**
 * The upstreams as shown to the UI, in configuration order. Any user name
 * or password in a target URL is left out, so it never reaches a browser.
 */
export function listUpstreams(upstreams: Map<string, URL>): UpstreamInfo[] {
	return [...upstreams].map(([name, url]) => {
		const target = new URL(url);
		target.username = '';
		target.password = '';
		return { name, target: target.href };
	});
}

/** The project of a call sent without `/@<project>` in front. */
const DEFAULT_PROJECT = 'general';

/** Whether `name` can be a project name: the same rule as upstream names. */
export function isProjectName(name: string): boolean {
	return NAME_PATTERN.test(name);
}

export interface Route {
	/** From an optional `/@<project>` in front, else `general`. */
	project: string;
	provider: string;
	target: URL;
}

/**
 * Maps `/<name>/rest?query` to the upstream `name`, appending `rest?query`
 * to the upstream's base path. An optional `/@<project>` in front tags the
 * call with a project and is not forwarded. Returns undefined when no
 * upstream matches or the project name is not usable.
 */
export function resolveRoute(
	requestUrl: string,
	upstreams: Map<string, URL>,
): Route | undefined {
	const match = /^(?:\/@([^/?]*))?\/([^/?]+)([^?]*)(\?.*)?$/.exec(requestUrl);
	if (!match) return undefined;

	const [, project = DEFAULT_PROJECT, provider, rest, query] = match;
	if (!isProjectName(project)) return undefined;
	const base = upstreams.get(provider);
	if (!base) return undefined;

	// Set the parts rather than resolving a relative URL, so a path such as
	// `//other.host/x` stays a path on this upstream.
	const target = new URL(base.origin);
	target.pathname = base.pathname.replace(/\/$/, '') + (rest || '/');
	target.search = query ?? '';
	return { project, provider, target };
}
