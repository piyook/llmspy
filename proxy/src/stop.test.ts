import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { stop } from './stop.js';

// Only the cases where nothing is stopped: a pid file that named this
// process and answered would make stop() send SIGTERM to the test run.
describe('stop', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'llmspy-stop-'));
	const file = path.join(dir, 'llmspy.pid');
	vi.spyOn(console, 'log').mockImplementation(() => {});

	afterAll(() => rmSync(dir, { recursive: true, force: true }));

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
			JSON.stringify({ pid: 123456, url: 'http://127.0.0.1:9' }),
		);
		expect(await stop(file)).toBe(0);
		expect(existsSync(file)).toBe(false);
	});

	it('removes a pid file it can not read as a record', async () => {
		writeFileSync(file, JSON.stringify({ pid: 'x' }));
		expect(await stop(file)).toBe(0);
		expect(existsSync(file)).toBe(false);
	});
});
