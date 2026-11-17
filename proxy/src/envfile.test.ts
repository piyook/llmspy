import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { loadEnvFile } from './envfile.js';

describe('loadEnvFile', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'llmspy-env-'));
	const file = path.join(dir, '.env');
	const names = ['LLMSPY_TEST_FROM_FILE', 'LLMSPY_TEST_FROM_SHELL'];

	afterEach(() => {
		for (const name of names) delete process.env[name];
	});
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it('does nothing when there is no file', () => {
		expect(loadEnvFile(path.join(dir, 'missing.env'))).toBe(false);
	});

	it('throws when the file can not be read', () => {
		// A folder can not be read as a file (EISDIR).
		expect(() => loadEnvFile(dir)).toThrow();
	});

	it('sets the variables in the file', () => {
		writeFileSync(file, '# a comment\nLLMSPY_TEST_FROM_FILE=a=https://x\n');
		expect(loadEnvFile(file)).toBe(true);
		expect(process.env.LLMSPY_TEST_FROM_FILE).toBe('a=https://x');
	});

	it('leaves a variable set in the shell as it is', () => {
		process.env.LLMSPY_TEST_FROM_SHELL = 'shell';
		writeFileSync(file, 'LLMSPY_TEST_FROM_SHELL=file\n');
		loadEnvFile(file);
		expect(process.env.LLMSPY_TEST_FROM_SHELL).toBe('shell');
	});
});
