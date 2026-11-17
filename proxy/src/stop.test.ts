import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { stop } from './stop.js';

// A pid that is not this test run's, so a real kill could never hit it; the
// tests that reach the kill replace process.kill.
const FAKE_PID = 999_999;

/** A server that answers /ping with `pid`, as LLMSpy does. */
async function fakeLlmspy(
	pid: number,
): Promise<{ server: Server; url: string }> {
	const server = createServer((_req, res) => {
		res.setHeader('connection', 'close');
		res.end(JSON.stringify({ pid }));
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const { port } = server.address() as AddressInfo;
	return { server, url: `http://127.0.0.1:${port}` };
}

describe('stop', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'llmspy-stop-'));
	const file = path.join(dir, 'llmspy.pid');
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});

	afterEach(() => {
		rmSync(file, { force: true });
		vi.mocked(console.log).mockClear();
	});
	afterAll(() => {
		vi.restoreAllMocks();
		rmSync(dir, { recursive: true, force: true });
	});

	it('says LLMSpy is not running when there is no pid file', async () => {
		expect(await stop(file)).toBe(0);
		expect(console.log).toHaveBeenCalledWith(
			'LLMSpy is not running (no pid file).',
		);
	});

	it('removes a pid file that nothing answers for', async () => {
		// Port 9 (discard) on loopback: refused at once.
		writeFileSync(
			file,
			JSON.stringify({ pid: FAKE_PID, url: 'http://127.0.0.1:9' }),
		);
		expect(await stop(file)).toBe(0);
		expect(existsSync(file)).toBe(false);
	});

	it.each([JSON.stringify({ pid: 'x' }), 'null', 'not json'])(
		'removes a pid file it can not read as a record: %s',
		async (text) => {
			writeFileSync(file, text);
			expect(await stop(file)).toBe(0);
			expect(existsSync(file)).toBe(false);
			expect(console.log).toHaveBeenCalledWith(
				'LLMSpy is not running (removed an unreadable pid file).',
			);
		},
	);

	it('stops the process that answers with the recorded pid', async () => {
		const { server, url } = await fakeLlmspy(FAKE_PID);
		writeFileSync(file, JSON.stringify({ pid: FAKE_PID, url }));
		const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
			server.close();
			return true;
		});
		try {
			expect(await stop(file)).toBe(0);
			expect(kill).toHaveBeenCalledWith(FAKE_PID, 'SIGTERM');
			expect(existsSync(file)).toBe(false);
		} finally {
			kill.mockRestore();
			server.close();
		}
	});

	it('counts a process that ended before the kill as stopped', async () => {
		const { server, url } = await fakeLlmspy(FAKE_PID);
		writeFileSync(file, JSON.stringify({ pid: FAKE_PID, url }));
		const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
			server.close();
			throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
		});
		try {
			expect(await stop(file)).toBe(0);
			expect(console.log).toHaveBeenCalledWith(
				`LLMSpy stopped (pid ${FAKE_PID}).`,
			);
		} finally {
			kill.mockRestore();
			server.close();
		}
	});

	it('stops a real process', async () => {
		// A child that answers /ping with its own pid, as LLMSpy does.
		const child = spawn(
			process.execPath,
			[
				'-e',
				`const s = require('node:http').createServer((q, r) => { r.setHeader('connection', 'close'); r.end(JSON.stringify({ pid: process.pid })); });
				s.listen(0, '127.0.0.1', () => console.log(s.address().port));`,
			],
			{ stdio: ['ignore', 'pipe', 'inherit'] },
		);
		try {
			const [chunk] = await once(child.stdout, 'data');
			const url = `http://127.0.0.1:${String(chunk).trim()}`;
			writeFileSync(file, JSON.stringify({ pid: child.pid, url }));
			const exited = once(child, 'exit');
			expect(await stop(file)).toBe(0);
			await exited;
			expect(existsSync(file)).toBe(false);
		} finally {
			child.kill();
		}
	});
});
