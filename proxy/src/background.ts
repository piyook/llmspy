// `llmspy --background`: starts LLMSpy in the background and returns once it
// is listening. The background process is a plain `llmspy`, with its output in
// a log file; it loads ~/.llmspy/.env itself, so what it says about that is in
// the log too. It says it is listening with a message on an IPC channel, so
// readiness does not depend on the pid file, which LLMSpy may fail to write.
// `llmspy stop` stops it, as it would a foreground one.
import { type ChildProcess, spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import {
	closeSync,
	fstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
} from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { checkPidFile, PID_FILE } from './pidfile.js';

/** What the background LLMSpy prints. A start moves the last one to LOG_FILE.old. */
const LOG_FILE = path.join(homedir(), '.llmspy', 'llmspy.log');

/** Set for the background process, which then reports on the IPC channel. */
const BACKGROUND_ENV = 'LLMSPY_BACKGROUND';
const READY = 'llmspy:ready';
/** Generous: startup prunes and checks the database before it listens. */
const TIMEOUT_MS = 60_000;
/** Lines of the log shown when the background LLMSpy did not start. */
const TAIL_LINES = 20;

type Outcome =
	| { kind: 'ready' | 'exited' | 'timeout' }
	| { kind: 'failed'; error: Error };

/** Run by LLMSpy once it listens: tells `llmspy --background` it is ready. */
export function notifyReady(): void {
	if (process.env[BACKGROUND_ENV] === '1') process.send?.({ type: READY });
}

/** Waits for `child` to say it is ready, to exit, to fail to start, or for `timeoutMs`. */
export function waitUntilReady(
	child: EventEmitter,
	timeoutMs = TIMEOUT_MS,
): Promise<Outcome> {
	return new Promise((resolve) => {
		const done = (outcome: Outcome) => {
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

/** The command that stops LLMSpy, as this one was run: npm sets npm_command for npx. */
export function stopCommand(env = process.env): string {
	return env.npm_command === 'exec' ? 'npx llmspy stop' : 'llmspy stop';
}

/**
 * Opens a new log, moving the last one to LOG_FILE.old: a rename leaves a
 * file that another LLMSpy still writes to intact, where emptying it would
 * not. If it can't be moved, the new output is added to its end.
 */
function openLog(): number {
	mkdirSync(path.dirname(LOG_FILE), { recursive: true });
	try {
		renameSync(LOG_FILE, `${LOG_FILE}.old`);
	} catch {
		// No log yet, or it can't be moved.
	}
	return openSync(LOG_FILE, 'a');
}

/** What the log holds after byte `from`: the background LLMSpy's own output. */
function readLog(from: number): string {
	try {
		return readFileSync(LOG_FILE).subarray(from).toString('utf8');
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

	const { outcome, pid, from } = await launch();
	if (outcome.kind === 'ready') {
		process.stdout.write(readLog(from));
		console.log(
			`\nRunning in the background (pid ${pid}). Log: ${LOG_FILE}\nStop it with: ${stopCommand()}`,
		);
		return 0;
	}
	return reportFailure(outcome, from);
}

/**
 * Starts a plain `llmspy` detached, its output in a new log, and waits for it.
 * Resolves with the outcome, its pid, and where its output starts in the log.
 */
async function launch(): Promise<{
	outcome: Outcome;
	pid: number | undefined;
	from: number;
}> {
	const log = openLog();
	const from = fstatSync(log).size;
	let child: ChildProcess;
	try {
		// execArgv keeps a loader such as tsx's when the CLI runs from source.
		child = spawn(
			process.execPath,
			[...process.execArgv, process.argv[1]],
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
	const outcome = await waitUntilReady(child);
	if (outcome.kind === 'timeout') child.kill();
	if (child.connected) child.disconnect();
	child.unref();
	return { outcome, pid: child.pid, from };
}

/** Says why the background LLMSpy did not start, and returns the exit code. */
function reportFailure(outcome: Outcome, from: number): number {
	if (outcome.kind === 'failed') {
		console.error(`Could not start LLMSpy: ${outcome.error.message}`);
		return 1;
	}
	console.error(
		outcome.kind === 'timeout'
			? `LLMSpy did not start within ${TIMEOUT_MS / 1000} s, so it was stopped.`
			: 'LLMSpy did not start.',
	);
	const tail = readLog(from)
		.trimEnd()
		.split('\n')
		.slice(-TAIL_LINES)
		.join('\n');
	if (tail) console.error(`From ${LOG_FILE}:\n${tail}`);
	return 1;
}
