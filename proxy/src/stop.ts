// `llmspy stop` (and `npm run stop`): stops the LLMSpy started with `llmspy`,
// `npm start` or `npm run dev` on this machine, found from the pid file it
// writes on startup. Not for Docker (use `npm run stop:docker`).
import { rmSync } from 'node:fs';
import { checkPidFile, PID_FILE, pingPid } from './pidfile.js';

const POLL_MS = 100;
const POLLS = 50;

/** Stops the LLMSpy recorded in `file`, and resolves with the exit code. */
export async function stop(file = PID_FILE): Promise<number> {
	let state: Awaited<ReturnType<typeof checkPidFile>>;
	try {
		state = await checkPidFile(file);
	} catch (error) {
		console.error(`Could not read ${file}: ${(error as Error).message}`);
		return 1;
	}
	if (state.kind === 'none') {
		console.log('LLMSpy is not running (no pid file).');
		return 0;
	}
	if (state.kind === 'invalid') {
		rmSync(file, { force: true });
		console.log('LLMSpy is not running (removed an unreadable pid file).');
		return 0;
	}
	// A pid file left by a process that died without cleaning up may name a
	// pid the system has since given to something else: only stop it if
	// LLMSpy at the recorded URL says it is that process.
	if (state.kind === 'stale') {
		rmSync(file, { force: true });
		console.log('LLMSpy is not running (removed a stale pid file).');
		return 0;
	}
	const { pid, url } = state;

	try {
		process.kill(pid, 'SIGTERM');
	} catch (error) {
		// It ended between the ping and the kill, which is what we wanted.
		if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
	}

	// SIGTERM lets the proxy close and remove its pid file; on Windows it ends
	// the process at once, so the file is removed here as well.
	for (let polls = 0; (await pingPid(url)) === pid; polls++) {
		if (polls === POLLS) {
			console.error(`LLMSpy (pid ${pid}) did not stop.`);
			return 1;
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
	}
	rmSync(file, { force: true });
	console.log(`LLMSpy stopped (pid ${pid}).`);
	return 0;
}
