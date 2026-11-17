// `llmspy --background`: starts LLMSpy in the background and returns once it
// is listening. The background process is a plain `llmspy`, with its output in
// a log file; it loads ~/.llmspy/.env itself, so what it says about that is in
// the log too. It says it is listening with a message on an IPC channel
// (ready.ts), so readiness does not depend on the pid file, which LLMSpy may
// fail to write. `llmspy stop` stops it, as it would a foreground one.
import { type ChildProcess, spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import {
	closeSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
} from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { checkPidFile, PID_FILE } from './pidfile.js';
import { BACKGROUND_ENV, READY } from './ready.js';

/** The background LLMSpy's output. */
const LOG_FILE = path.join(homedir(), '.llmspy', 'llmspy.log');
/**
 * A new run writes here, and the file becomes LOG_FILE (the last one moving
 * to LOG_FILE.old) only once it is listening: a start that fails leaves the
 * log of an LLMSpy that may still be running alone.
 */
const NEW_LOG_FILE = `${LOG_FILE}.new`;
/** Generous: startup prunes and checks the database before it listens. */
const TIMEOUT_MS = 60_000;
/** How long a process that timed out gets to end once it is told to. */
const STOP_MS = 3000;
/** Lines of the log shown when the background LLMSpy did not start. */
const TAIL_LINES = 20;
/** The Node flags passed on to the background process: loaders, such as tsx's. */
const LOADER_FLAGS = new Set([
	'--import',
	'--require',
	'-r',
	'--loader',
	'--experimental-loader',
]);

type Failed = { kind: 'failed'; error: Error };
type Waited =
	| { kind: 'ready' }
	| { kind: 'exited' }
	| { kind: 'timeout' }
	| Failed;
/** What became of the launch: a timeout says whether the process ended once told to. */
type Outcome =
	| { kind: 'ready' }
	| { kind: 'exited' }
	| { kind: 'timeout'; stopped: boolean }
	| Failed;

/** Waits for `child` to say it is ready, to exit, to fail to start, or for `timeoutMs`. */
export function waitUntilReady(
	child: EventEmitter,
	timeoutMs = TIMEOUT_MS,
): Promise<Waited> {
	return new Promise((resolve) => {
		const done = (outcome: Waited) => {
			clearTimeout(timer);
			child.off('message', onMessage);
			child.off('exit', onExit);
			child.off('error', onError);
			resolve(outcome);
		};
		const onMessage = (message: unknown) => {
			if ((message as { type?: unknown } | null)?.type === READY)
				done({ kind: 'ready' });
		};
		const onExit = () => done({ kind: 'exited' });
		const onError = (error: Error) => done({ kind: 'failed', error });
		const timer = setTimeout(() => done({ kind: 'timeout' }), timeoutMs);
		child.on('message', onMessage);
		child.on('exit', onExit);
		child.on('error', onError);
	});
}

/** Resolves true once `child` has exited, false if it has not within `ms`. */
export function waitForExit(
	child: Pick<EventEmitter, 'once' | 'off'> & {
		exitCode: number | null;
		signalCode: string | null;
	},
	ms = STOP_MS,
): Promise<boolean> {
	if (child.exitCode !== null || child.signalCode !== null)
		return Promise.resolve(true);
	return new Promise((resolve) => {
		const onExit = () => {
			clearTimeout(timer);
			resolve(true);
		};
		const timer = setTimeout(() => {
			child.off('exit', onExit);
			resolve(false);
		}, ms);
		child.once('exit', onExit);
	});
}

/** The loader flags in `execArgv` (`--import x` or `--import=x`), and nothing else, such as `--inspect`. */
export function loaderArgs(execArgv: readonly string[]): string[] {
	const kept: string[] = [];
	for (let i = 0; i < execArgv.length; i++) {
		const arg = execArgv[i];
		const [flag] = arg.split('=', 1);
		if (!LOADER_FLAGS.has(flag)) continue;
		if (arg.includes('=')) kept.push(arg);
		else if (i + 1 < execArgv.length) kept.push(arg, execArgv[++i]);
	}
	return kept;
}

/** The command that stops LLMSpy, as this one was run: npm sets npm_command for npx. */
export function stopCommand(env = process.env): string {
	return env.npm_command === 'exec' ? 'npx llmspy stop' : 'llmspy stop';
}

/** The new run's log becomes LOG_FILE; resolves with where its output now is. */
function keepNewLog(): string {
	try {
		renameSync(LOG_FILE, `${LOG_FILE}.old`);
	} catch {
		// No log yet, or it can't be moved: the new one replaces it below.
	}
	try {
		renameSync(NEW_LOG_FILE, LOG_FILE);
		return LOG_FILE;
	} catch {
		return NEW_LOG_FILE;
	}
}

function readLog(file: string): string {
	try {
		return readFileSync(file, 'utf8');
	} catch {
		return '';
	}
}

/** Starts LLMSpy in the background, and resolves with the exit code. */
export async function startInBackground(): Promise<number> {
	let state: Awaited<ReturnType<typeof checkPidFile>>;
	try {
		state = await checkPidFile();
	} catch (error) {
		console.error(
			`Could not read ${PID_FILE}: ${(error as Error).message}`,
		);
		return 1;
	}
	if (state.kind === 'running') {
		console.log(
			`LLMSpy is already running at ${state.url} (pid ${state.pid}).`,
		);
		return 0;
	}

	const { outcome, pid } = await launch();
	if (outcome.kind === 'ready') {
		const log = keepNewLog();
		process.stdout.write(readLog(log));
		console.log(
			`\nRunning in the background (pid ${pid}). Log: ${log}\nStop it with: ${stopCommand()}`,
		);
		return 0;
	}
	return reportFailure(outcome, pid);
}

/** Starts a plain `llmspy` detached, its output in NEW_LOG_FILE, and waits for it. */
async function launch(): Promise<{
	outcome: Outcome;
	pid: number | undefined;
}> {
	mkdirSync(path.dirname(LOG_FILE), { recursive: true });
	const log = openSync(NEW_LOG_FILE, 'w');
	let child: ChildProcess;
	try {
		child = spawn(
			process.execPath,
			[...loaderArgs(process.execArgv), process.argv[1]],
			{
				detached: true,
				stdio: ['ignore', log, log, 'ipc'],
				windowsHide: true,
				env: { ...process.env, [BACKGROUND_ENV]: '1' },
			},
		);
	} finally {
		closeSync(log);
	}
	// Kept for the whole launch: a kill or disconnect that fails after the
	// wait must not crash the launcher.
	child.on('error', () => {});

	const waited = await waitUntilReady(child);
	let outcome: Outcome;
	if (waited.kind === 'timeout') {
		child.kill();
		outcome = { kind: 'timeout', stopped: await waitForExit(child) };
	} else {
		outcome = waited;
	}
	if (child.connected) child.disconnect();
	child.unref();
	return { outcome, pid: child.pid };
}

/** Why the background LLMSpy (`pid`) did not start. */
export function failureMessage(
	outcome: Exclude<Outcome, { kind: 'ready' }>,
	pid: number | undefined,
): string {
	const within = `LLMSpy did not start within ${TIMEOUT_MS / 1000} s`;
	switch (outcome.kind) {
		case 'failed':
			return `Could not start LLMSpy: ${outcome.error.message}`;
		case 'timeout':
			return outcome.stopped
				? `${within}, so it was stopped.`
				: `${within} and may still be running (pid ${pid}).`;
		case 'exited':
			return 'LLMSpy did not start.';
	}
}

/** The last `count` lines of `text`, without its trailing newline. */
export function lastLines(text: string, count = TAIL_LINES): string {
	return text.trimEnd().split('\n').slice(-count).join('\n');
}

/** Says why the background LLMSpy did not start, with the end of its log, and returns the exit code. */
function reportFailure(
	outcome: Exclude<Outcome, { kind: 'ready' }>,
	pid: number | undefined,
): number {
	console.error(failureMessage(outcome, pid));
	const tail = lastLines(readLog(NEW_LOG_FILE));
	if (tail) console.error(`From ${NEW_LOG_FILE}:\n${tail}`);
	return 1;
}
