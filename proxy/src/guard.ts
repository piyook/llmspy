import type { IncomingHttpHeaders } from 'node:http';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const WILDCARD = new Set(['0.0.0.0', '::']);

function parseHost(value: string): URL | undefined {
	try {
		return new URL(`http://${value}`);
	} catch {
		return undefined;
	}
}

/**
 * Whether a request may use the UI's API. Captured prompts are not masked, so
 * only the UI itself may read them:
 * - `Host` must be a loopback name (or the address LLMSpy was told to listen
 *   on), which defeats DNS rebinding: a rebound page still sends its own name.
 * - `Origin`, when there is one, must be the same origin as `Host`, so another
 *   site open in the browser cannot read or clear captures.
 * Clients that are not browsers (curl, scripts, the Docker healthcheck) send
 * no `Origin` and pass.
 */
export function isAllowedUiRequest(
	headers: IncomingHttpHeaders,
	listenHost: string,
): boolean {
	const host = headers.host ? parseHost(headers.host) : undefined;
	if (!host) return false;

	const allowed =
		LOOPBACK.has(host.hostname) ||
		(!WILDCARD.has(listenHost) &&
			host.hostname === parseHost(listenHost)?.hostname);
	if (!allowed) return false;

	const { origin } = headers;
	if (origin === undefined) return true;
	try {
		const url = new URL(origin);
		return url.protocol === 'http:' && url.host === host.host;
	} catch {
		// Includes `Origin: null` from sandboxed frames and file pages.
		return false;
	}
}
