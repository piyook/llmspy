import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';

/** Where a running LLMSpy says who it is, for `npm run stop` (scripts/stop.mjs reads the same path). */
export const PID_FILE = path.join(homedir(), '.llmspy', 'llmspy.pid');

/**
 * Records this process and the URL it answers on, and removes the record when
 * the process exits. A failure to write is only a warning: the proxy works
 * without it, `npm run stop` just can't find it.
 */
export function writePidFile(url: string, file = PID_FILE): void {
	try {
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, JSON.stringify({ pid: process.pid, url }));
	} catch (error) {
		console.warn(`Could not write ${file}: ${(error as Error).message}`);
		return;
	}
	process.on('exit', () => removePidFile(file));
}

/** Removes the file only if it is still this process's, so a newer LLMSpy's record is left alone. */
export function removePidFile(file = PID_FILE): void {
	try {
		const { pid } = JSON.parse(readFileSync(file, 'utf8'));
		if (pid === process.pid) rmSync(file);
	} catch {
		// Gone already, or not ours to read.
	}
}
