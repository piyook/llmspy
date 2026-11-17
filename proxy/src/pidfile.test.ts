import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
	checkPidFile,
	readPidFile,
	removePidFile,
	writePidFile,
} from './pidfile.js';

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

	it('reads the record back', () => {
		writePidFile('http://127.0.0.1:8080', file);
		expect(readPidFile(file)).toEqual({
			pid: process.pid,
			url: 'http://127.0.0.1:8080',
		});
	});

	it('says when there is no record', () => {
		expect(readPidFile(path.join(dir, 'missing.pid'))).toBe('none');
	});

	it.each(['null', 'not json', '{"pid":1}', '{"pid":"1","url":"x"}'])(
		'says when %s is not a record',
		(text) => {
			writePidFile('x', file);
			writeFileSync(file, text);
			expect(readPidFile(file)).toBe('invalid');
		},
	);

	it('throws other read errors', () => {
		// A folder can not be read as a file (EISDIR).
		writePidFile('x', file);
		expect(() => readPidFile(path.dirname(file))).toThrow();
	});

	it('does not throw when there is no file', () => {
		expect(() =>
			removePidFile(path.join(dir, 'missing.pid')),
		).not.toThrow();
	});
});

describe('checkPidFile', () => {
	const PID = 999_999;
	const dir = mkdtempSync(path.join(tmpdir(), 'llmspy-check-'));
	const file = path.join(dir, 'llmspy.pid');
	let server: Server | undefined;

	/** A server that answers /ping with `pid`, as LLMSpy does. */
	async function fakeLlmspy(pid: number): Promise<string> {
		server = createServer((_req, res) => {
			res.setHeader('connection', 'close');
			res.end(JSON.stringify({ pid }));
		});
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	}
	const writeRecord = (pid: number, url: string) =>
		writeFileSync(file, JSON.stringify({ pid, url }));

	afterEach(async () => {
		rmSync(file, { force: true });
		if (server) {
			server.close();
			await once(server, 'close');
			server = undefined;
		}
	});
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it('is running when LLMSpy answers with the recorded pid', async () => {
		const url = await fakeLlmspy(PID);
		writeRecord(PID, url);
		expect(await checkPidFile(file)).toEqual({
			kind: 'running',
			pid: PID,
			url,
		});
	});

	it('is stale when another process answers, or nothing does', async () => {
		const url = await fakeLlmspy(PID + 1);
		writeRecord(PID, url);
		expect((await checkPidFile(file)).kind).toBe('stale');
		writeRecord(PID, 'http://127.0.0.1:1');
		expect((await checkPidFile(file)).kind).toBe('stale');
	});

	it('says when there is no file, or an unreadable one', async () => {
		expect(await checkPidFile(file)).toEqual({ kind: 'none' });
		writeFileSync(file, 'not json');
		expect(await checkPidFile(file)).toEqual({ kind: 'invalid' });
	});

	it('throws other read errors', async () => {
		await expect(checkPidFile(dir)).rejects.toThrow();
	});
});
