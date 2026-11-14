import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { removePidFile, writePidFile } from './pidfile.js';

describe('pid file', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'llmspy-pid-'));
	const file = path.join(dir, 'nested', 'llmspy.pid');

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('records the pid and url, creating the folder', () => {
		writePidFile('http://127.0.0.1:8080', file);
		expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
			pid: process.pid,
			url: 'http://127.0.0.1:8080',
		});
	});

	it('removes its own record', () => {
		writePidFile('http://127.0.0.1:8080', file);
		removePidFile(file);
		expect(() => readFileSync(file)).toThrow();
	});

	it("leaves another process's record alone", () => {
		writePidFile('http://127.0.0.1:8080', file);
		const other = JSON.stringify({ pid: process.pid + 1, url: 'x' });
		writeFileSync(file, other);
		removePidFile(file);
		expect(readFileSync(file, 'utf8')).toBe(other);
	});

	it('does not throw when there is no file', () => {
		expect(() =>
			removePidFile(path.join(dir, 'missing.pid')),
		).not.toThrow();
	});
});
