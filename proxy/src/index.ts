import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { writePidFile } from './pidfile.js';
import { ProxyServer } from './proxy.js';
import { parseRetentionDays, RequestStore } from './store.js';
import type { ProxyConfig } from './types.js';
import { parseUpstreams } from './upstreams.js';

// Built layout: proxy/dist/index.js next to ui/dist/ (also in the image).
const uiDir = path.resolve(import.meta.dirname, '../../ui/dist');
const dbFile = path.join(homedir(), '.llmspy', 'llmspy.db');
const HOUR_MS = 60 * 60 * 1000;

let config: ProxyConfig;
let store: RequestStore;
try {
	config = {
		port: Number.parseInt(process.env.PROXY_PORT ?? '8080', 10),
		host: process.env.LLMSPY_HOST ?? '127.0.0.1',
		upstreams: parseUpstreams(process.env.LLMSPY_UPSTREAMS),
		uiDir,
	};
	const retentionDays = parseRetentionDays(process.env.LLMSPY_RETENTION_DAYS);
	mkdirSync(path.dirname(dbFile), { recursive: true });
	store = new RequestStore({ path: dbFile, retentionDays });
} catch (error) {
	console.error((error as Error).message);
	process.exit(1);
}

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
		const base = `http://${shownHost}:${port}`;
		// Written only once the port is ours, so a second start that fails leaves the first one's record.
		writePidFile(base);
		const width = Math.max(
			...[...config.upstreams.keys()].map((n) => n.length),
		);

		console.log(`LLMSpy listening on ${config.host}:${port}`);
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
