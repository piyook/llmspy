import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type * as http from 'node:http';
import * as path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
};

/**
 * Serves a file from `root` (the built UI) for a GET or HEAD request.
 * `/` serves `index.html`. Paths that would leave `root` are refused.
 * Resolves false when there is no such file, so the caller can answer 404.
 */
export async function serveStatic(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	root: string,
): Promise<boolean> {
	if (req.method !== 'GET' && req.method !== 'HEAD') return false;

	let pathname: string;
	try {
		pathname = decodeURIComponent(
			new URL(req.url ?? '/', 'http://localhost').pathname,
		);
	} catch {
		return false;
	}
	if (pathname.includes('\0')) return false;
	if (pathname.endsWith('/')) pathname += 'index.html';

	const base = path.resolve(root);
	const file = path.resolve(base, `.${pathname}`);
	if (!file.startsWith(base + path.sep)) return false;

	try {
		const info = await stat(file);
		if (!info.isFile()) return false;

		res.writeHead(200, {
			'content-type':
				CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
			'content-length': info.size,
			'cache-control': 'no-cache',
			'x-content-type-options': 'nosniff',
		});
		if (req.method === 'HEAD') {
			res.end();
		} else {
			createReadStream(file)
				.on('error', () => res.destroy())
				.pipe(res);
		}
		return true;
	} catch {
		return false;
	}
}
