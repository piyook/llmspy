import { ProxyServer } from './proxy.js';
import { RequestStore } from './store.js';
import type { ProxyConfig } from './types.js';
import { parseUpstreams } from './upstreams.js';

const host = '127.0.0.1';
const uiPort = Number.parseInt(process.env.UI_PORT ?? '3000', 10);

let config: ProxyConfig;
try {
	config = {
		port: Number.parseInt(process.env.PROXY_PORT ?? '8080', 10),
		host,
		upstreams: parseUpstreams(process.env.LLMSPY_UPSTREAMS),
		maxRequests: 500,
	};
} catch (error) {
	console.error((error as Error).message);
	process.exit(1);
}

const store = new RequestStore(config.maxRequests);
const proxy = new ProxyServer(config, store);

async function start(): Promise<void> {
	try {
		const port = await proxy.start();
		const base = `http://${host}:${port}`;
		const width = Math.max(
			...[...config.upstreams.keys()].map((n) => n.length),
		);

		console.log(`LLMSpy listening on ${base}`);
		console.log(`UI: http://localhost:${uiPort}\n`);
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

process.on('SIGINT', async () => {
	await proxy.stop();
	process.exit(0);
});

start();
