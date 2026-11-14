// `npm run stop`: stops the LLMSpy started with `npm start` on this machine,
// found from the pid file it writes on startup. Not for Docker (use
// `npm run stop:docker`) or `npm run dev` (stop it with Ctrl+C).
import { readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';

// Same path as PID_FILE in proxy/src/pidfile.ts.
const file = path.join(homedir(), '.llmspy', 'llmspy.pid');

let record;
try {
	record = JSON.parse(readFileSync(file, 'utf8'));
} catch {
	console.log('LLMSpy is not running (no pid file).');
	process.exit(0);
}
const { pid, url } = record;

/** The pid that answers at the recorded URL, or undefined if nothing does. */
async function pingPid() {
	try {
		const res = await fetch(`${url}/ping`, {
			signal: AbortSignal.timeout(2000),
		});
		return (await res.json()).pid;
	} catch {
		return undefined;
	}
}

// A pid file left by a process that died without cleaning up may name a pid
// the system has since given to something else: only stop it if LLMSpy at
// the recorded URL says it is that process.
if ((await pingPid()) !== pid) {
	rmSync(file, { force: true });
	console.log('LLMSpy is not running (removed a stale pid file).');
	process.exit(0);
}

process.kill(pid, 'SIGTERM');

// SIGTERM lets the proxy close and remove its pid file; on Windows it ends
// the process at once, so the file is removed here as well.
for (let i = 0; i < 50 && (await pingPid()) === pid; i++) {
	await new Promise((resolve) => setTimeout(resolve, 100));
}
if ((await pingPid()) === pid) {
	console.error(`LLMSpy (pid ${pid}) did not stop.`);
	process.exit(1);
}
rmSync(file, { force: true });
console.log(`LLMSpy stopped (pid ${pid}).`);
