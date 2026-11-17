// `llmspy stop` (and `npm run stop`): stops the LLMSpy started with `llmspy`
// or `npm start` on this machine, found from the pid file it writes on
// startup. Not for Docker (use `npm run stop:docker`) or `npm run dev` (stop
// it with Ctrl+C).
import { readFileSync, rmSync } from 'node:fs';
import { PID_FILE } from './pidfile.js';

/** The pid that answers at `url`, or undefined if nothing does. */
async function pingPid(url: string): Promise<unknown> {
	try {
		const res = await fetch(`${url}/ping`, {
			signal: AbortSignal.timeout(2000),
		});
		return ((await res.json()) as { pid?: unknown }).pid;
	} catch {
		return undefined;
	}
}

/** Stops the LLMSpy recorded in `file`, and resolves with the exit code. */
export async function stop(file = PID_FILE): Promise<number> {
	let record: { pid?: unknown; url?: unknown };
	try {
		record = JSON.parse(readFileSync(file, 'utf8'));
	} catch {
		console.log('LLMSpy is not running (no pid file).');
		return 0;
	}
	const { pid, url } = record;

	// A pid file left by a process that died without cleaning up may name a
	// pid the system has since given to something else: only stop it if
	// LLMSpy at the recorded URL says it is that process.
	if (
		typeof pid !== 'number' ||
		typeof url !== 'string' ||
		(await pingPid(url)) !== pid
	) {
		rmSync(file, { force: true });
		console.log('LLMSpy is not running (removed a stale pid file).');
		return 0;
	}

	process.kill(pid, 'SIGTERM');

	// SIGTERM lets the proxy close and remove its pid file; on Windows it ends
	// the process at once, so the file is removed here as well.
	for (let i = 0; i < 50 && (await pingPid(url)) === pid; i++) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	if ((await pingPid(url)) === pid) {
		console.error(`LLMSpy (pid ${pid}) did not stop.`);
		return 1;
	}
	rmSync(file, { force: true });
	console.log(`LLMSpy stopped (pid ${pid}).`);
	return 0;
}
