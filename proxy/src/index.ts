import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { notifyReady } from './background.js';
import { hostForUrl } from './guard.js';
import { writePidFile } from './pidfile.js';
import { ProxyServer } from './proxy.js';
import { parseRetentionDays, RequestStore } from './store.js';
import type { ProxyConfig } from './types.js';
import { parseUpstreams } from './upstreams.js';
import { readVersion } from './version.js';

// Built layout: proxy/dist/index.js next to ui/dist/ (also in the image and
// the npm package).
const uiDir = path.resolve(import.meta.dirname, '../../ui/dist');
// llms.txt is at the root of the repo, the image and the npm package.
const llmsTxtFile = path.resolve(import.meta.dirname, '../../llms.txt');
const dbFile = path.join(homedir(), '.llmspy', 'llmspy.db');
const HOUR_MS = 60 * 60 * 1000;

/** The text of llms.txt, or undefined when it is not there (then `/llms.txt` is a 404). */
function readLlmsTxt(): string | undefined {
	try {
		return readFileSync(llmsTxtFile, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			return undefined;
		throw error;
	}
}

let config: ProxyConfig;
let store: RequestStore;
let retentionDays: number;
try {
	config = {
		port: Number.parseInt(process.env.PROXY_PORT ?? '8080', 10),
		host: process.env.LLMSPY_HOST ?? '127.0.0.1',
		upstreams: parseUpstreams(process.env.LLMSPY_UPSTREAMS),
		uiDir,
		llmsTxt: readLlmsTxt(),
		version: readVersion(),
	};
	retentionDays = parseRetentionDays(process.env.LLMSPY_RETENTION_DAYS);
	mkdirSync(path.dirname(dbFile), { recursive: true });
	store = new RequestStore({ path: dbFile, retentionDays });
} catch (error) {
	console.error((error as Error).message);
	process.exit(1);
}
const keptFor =
	retentionDays === 0
		? 'until cleared'
		: `${retentionDays} day${retentionDays === 1 ? '' : 's'}`;

store.prune();
setInterval(() => store.prune(), HOUR_MS).unref();
const proxy = new ProxyServer(config, store);

async function start(): Promise<void> {
	try {
		const port = await proxy.start();
		// In a container LLMSpy listens on all interfaces, but it is reached
		// through the port published on the host's loopback.
		const shownHost = ['0.0.0.0', '::'].includes(config.host)
			? '127.0.0.1'
			: config.host;
		const base = `http://${hostForUrl(shownHost)}:${port}`;
		// Written only once the port is ours, so a second start that fails leaves the first one's record.
		writePidFile(base);
		const width = Math.max(
			...[...config.upstreams.keys()].map((n) => n.length),
		);

		console.log(
			`LLMSpy ${config.version} listening on ${hostForUrl(config.host)}:${port}`,
		);
		console.log(`Calls kept ${keptFor} in ${dbFile}`);
		if (existsSync(path.join(uiDir, 'index.html'))) {
			console.log(`UI: ${base}/\n`);
		} else {
			console.log(
				'UI: not built here (npm run build); `npm run dev` serves it on http://localhost:3000\n',
			);
		}
		console.log('Point an app at one of these base URLs:');
		for (const [name, url] of config.upstreams) {
			console.log(
				`  ${name.padEnd(width)}  ${base}/${name}  ->  ${url.href}`,
			);
		}
		console.log('\nFor example:');
		console.log(`  ANTHROPIC_BASE_URL=${base}/anthropic`);
		console.log(`  OPENAI_BASE_URL=${base}/openai/v1`);
		notifyReady();
	} catch (error) {
		console.error('Failed to start LLMSpy:', error);
		process.exit(1);
	}
}

// SIGTERM is what `docker stop` sends; as PID 1, Node would otherwise ignore it.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, async () => {
		await proxy.stop();
		store.close();
		process.exit(0);
	});
}

start();
