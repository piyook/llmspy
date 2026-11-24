// Records the LLMSpy docs demo video: a scripted terminal runs a small agent whose
// calls go through a running LLMSpy (8080) to llmock (8001, LLMSpy's mock config),
// while the LLMSpy UI beside it shows the calls live.
// Frames are JPEG screenshots at 1.5x, encoded to VP9 WebM with Playwright's ffmpeg.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const SPY = 'http://127.0.0.1:8080';
const MOCK = 'http://127.0.0.1:8001';
const PROJECT = 'picnic-bot';
const BASE_URL = `${SPY}/@${PROJECT}/llmock`;
const args = process.argv.slice(2);
const OUT = path.resolve(
	args.find((a) => !a.startsWith('--')) ??
		path.join(here, '..', '..', 'public', 'videos', 'llmspy-demo.webm'),
);
const POSTER = OUT.replace(/\.webm$/, '.jpg');
const FPS = 15;
const PREVIEW = args.includes('--shots');
// --shots also saves a few PNG stills to the temp folder, to check the video quickly.
const SHOTS = os.tmpdir();

function findFfmpeg() {
	const root =
		process.env.PLAYWRIGHT_BROWSERS_PATH ||
		(process.platform === 'win32'
			? path.join(process.env.LOCALAPPDATA, 'ms-playwright')
			: process.platform === 'darwin'
				? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
				: path.join(os.homedir(), '.cache', 'ms-playwright'));
	const exe = {
		win32: 'ffmpeg-win64.exe',
		darwin: 'ffmpeg-mac',
		linux: 'ffmpeg-linux',
	}[process.platform];
	const dirs = existsSync(root)
		? readdirSync(root)
				.filter((d) => d.startsWith('ffmpeg-'))
				.sort()
				.reverse()
		: [];
	for (const d of dirs)
		if (existsSync(path.join(root, d, exe))) return path.join(root, d, exe);
	throw new Error(
		`Playwright's ffmpeg was not found in ${root}: run "npx playwright install chromium ffmpeg"`,
	);
}
const FFMPEG = findFfmpeg();

const json = (body, method = 'POST') => ({
	method,
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify(body),
});
for (const [url, name] of [
	[SPY + '/ping', 'LLMSpy'],
	[MOCK + '/ping', 'llmock'],
]) {
	if (
		!(await fetch(url)
			.then((r) => r.ok)
			.catch(() => false))
	)
		throw new Error(`${name} is not answering at ${url}`);
}

// Replies for the demo, added to llmock at run time (the "sunny" reply is in mock/.llmockrc.json).
await fetch(MOCK + '/admin/reset', { method: 'POST' });
// Rules match in the order added, so the failing one goes first.
await fetch(
	MOCK + '/admin/rules',
	json({ match: 'Rome', in: 'last', fail: { status: 429 } }),
);
await fetch(
	MOCK + '/admin/rules',
	json({
		match: 'Plan a picnic',
		in: 'last',
		content: [
			{ type: 'text', text: 'Let me check the weather first.' },
			{ type: 'tool_use', name: 'get_weather', input: { city: 'Paris' } },
		],
	}),
);
await fetch(SPY + '/api/clear', { method: 'POST' });

// --- the demo agent: one tool, Anthropic Messages API through LLMSpy ---
const headers = {
	'content-type': 'application/json',
	'x-api-key': 'sk-ant-test-demo',
	'anthropic-version': '2023-06-01',
};
const tools = [
	{
		name: 'get_weather',
		description: 'Current weather for a city',
		input_schema: {
			type: 'object',
			properties: { city: { type: 'string' } },
			required: ['city'],
		},
	},
];
const body = (messages, extra = {}) =>
	JSON.stringify({
		model: 'claude-opus-5-5',
		max_tokens: 1024,
		system: 'You plan days out.',
		tools,
		messages,
		...extra,
	});
const call = (messages, extra) =>
	fetch(`${BASE_URL}/v1/messages`, {
		method: 'POST',
		headers,
		body: body(messages, extra),
	});

const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: 1280, height: 720 },
	deviceScaleFactor: 1.5,
	colorScheme: 'dark',
});
// Same origin as the UI, so its iframe lays out at full size and its API allows the calls.
await page.goto(SPY + '/ping');
await page.setContent(readFileSync(path.join(here, 'stage.html'), 'utf8'));
await page.evaluate(() => document.fonts.ready);
const T = (fn, ...a) => page.evaluate(fn, ...a);
await T((u) => {
	document.getElementById('dash').src = u;
}, SPY + '/');
await page.waitForFunction(
	() =>
		document.getElementById('dash').contentDocument?.body
			?.childElementCount > 0,
);
await page.waitForTimeout(2000);

const frames = [];
let capturing = true;
const t0 = Date.now();
const capture = (async () => {
	while (capturing) {
		const t = Date.now() - t0;
		frames.push({
			t,
			buf: await page.screenshot({ type: 'jpeg', quality: 92 }),
		});
	}
})();

const type = (s) => T((s) => window.term.type(s), s);
const print = (h) => T((h) => window.term.print(h), h);
const gap = () => T(() => window.term.gap());
const prompt = () => T(() => window.term.prompt());
const wait = (ms) => page.waitForTimeout(ms);
const ui = page.frameLocator('#dash');
async function click(locator) {
	const box = await locator.boundingBox();
	await T(
		([x, y]) => window.stage.moveCursor(x, y),
		[box.x + box.width / 2, box.y + box.height / 2],
	);
	await T(() => window.stage.clickFx());
	await locator.click();
}
const hideCursor = () => T(() => window.stage.hideCursor());
const shot = async (name) =>
	PREVIEW &&
	page.screenshot({ path: path.join(SHOTS, `llmspy-demo-${name}.png`) });

// --- Scene 1: start LLMSpy ---
await prompt();
await wait(600);
await type('npx llmspy --background');
await wait(300);
await print('LLMSpy 0.8.0 listening on 127.0.0.1:8080');
await print('UI: <span class="ok">http://127.0.0.1:8080/</span>');
await print('<span class="dim">Point an app at one of these base URLs:</span>');
await print('  anthropic  http://127.0.0.1:8080/anthropic');
await print('  openai     http://127.0.0.1:8080/openai');
await print('  llmock     http://127.0.0.1:8080/llmock');
await T(() => document.getElementById('browser').classList.add('on'));
await gap();
await prompt();
await wait(1400);

// --- Scene 2: point the agent at LLMSpy and run it ---
await type(`export ANTHROPIC_BASE_URL=${BASE_URL}`);
await gap();
await prompt();
await wait(300);
await type('node agent.mjs "Plan a picnic in Paris"');
const question = { role: 'user', content: 'Plan a picnic in Paris' };
const first = await (await call([question])).json();
const toolUse = first.content.find((b) => b.type === 'tool_use');
await print(
	`<span class="k">tool</span>  ${toolUse.name}({"city":"${toolUse.input.city}"})`,
);
await wait(500);
await print('<span class="dim">→</span>     sunny, 24C');
// The second call streams; show the reply as it arrives.
const res = await call(
	[
		question,
		{ role: 'assistant', content: first.content },
		{
			role: 'user',
			content: [
				{
					type: 'tool_result',
					tool_use_id: toolUse.id,
					content: 'sunny, 24C',
				},
			],
		},
	],
	{ stream: true },
);
await T(() => window.term.print('<span class="s" id="reply"></span>'));
let text = '';
for await (const chunk of res.body) {
	for (const line of Buffer.from(chunk).toString().split('\n')) {
		if (!line.startsWith('data:')) continue;
		const ev = JSON.parse(line.slice(5));
		if (
			ev.type === 'content_block_delta' &&
			ev.delta.type === 'text_delta'
		) {
			text += ev.delta.text;
			await T((t) => {
				const r = document.querySelectorAll('#reply');
				r[r.length - 1].textContent = t;
			}, text);
		}
	}
}
await gap();
await prompt();
await wait(600);

// --- Scene 3: read the calls in LLMSpy ---
await click(ui.getByRole('button', { name: new RegExp(`^${PROJECT}`) }));
await wait(1200);
await click(ui.locator('button.row').first());
await hideCursor();
await wait(2600);
await shot('conversation');
await click(
	ui
		.getByRole('tab', { name: 'Compare' })
		.or(ui.getByRole('button', { name: 'Compare' }))
		.first(),
);
await hideCursor();
await wait(2800);
await shot('compare');
await page.screenshot({ path: POSTER, type: 'jpeg', quality: 85 });

// --- Scene 4: a failing call ---
await type('node agent.mjs "Plan a picnic in Rome"');
const failed = await call([{ role: 'user', content: 'Plan a picnic in Rome' }]);
const err = await failed.json();
await print(
	`<span class="err">Error: ${failed.status} ${err.error?.type ?? ''}</span>`,
);
await gap();
await prompt();
await wait(900);
await click(ui.locator('button.row').first());
await wait(500);
await click(
	ui
		.getByRole('tab', { name: 'Raw' })
		.or(ui.getByRole('button', { name: 'Raw', exact: true }))
		.first(),
);
await hideCursor();
await wait(1200);
// Scroll the detail panel down to the 429 reply.
await ui
	.locator('summary', { hasText: 'Response Body' })
	.first()
	.evaluate((el) =>
		el.parentElement.scrollIntoView({ behavior: 'smooth', block: 'end' }),
	);
await wait(3200);
await shot('end');

capturing = false;
await capture;
await browser.close();
await fetch(MOCK + '/admin/reset', { method: 'POST' });

const dur = frames.at(-1).t;
const n = Math.floor((dur / 1000) * FPS);
const ff = spawn(
	FFMPEG,
	[
		'-y',
		'-loglevel',
		'error',
		'-f',
		'image2pipe',
		'-c:v',
		'mjpeg',
		'-framerate',
		String(FPS),
		'-i',
		'pipe:0',
		'-c:v',
		'libvpx-vp9',
		'-b:v',
		'0',
		'-crf',
		'36',
		'-deadline',
		'good',
		'-cpu-used',
		'2',
		'-an',
		OUT,
	],
	{ stdio: ['pipe', 'inherit', 'inherit'] },
);
let j = 0;
for (let i = 0; i < n; i++) {
	const t = (i * 1000) / FPS;
	while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
	if (!ff.stdin.write(frames[j].buf))
		await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
console.log(
	`frames captured: ${frames.length} over ${(dur / 1000).toFixed(1)}s → ${n} output frames`,
);
console.log('wrote', OUT, POSTER);
