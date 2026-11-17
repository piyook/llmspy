import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
	failureMessage,
	lastLines,
	loaderArgs,
	stopCommand,
	waitForExit,
	waitUntilReady,
} from './background.js';

describe('waitUntilReady', () => {
	it('is ready when the child says so, and ignores other messages', async () => {
		const child = new EventEmitter();
		const outcome = waitUntilReady(child, 5000);
		child.emit('message', { type: 'something else' });
		child.emit('message', null);
		child.emit('message', { type: 'llmspy:ready' });
		expect(await outcome).toEqual({ kind: 'ready' });
		expect(child.listenerCount('message')).toBe(0);
	});

	it('stops waiting when the child exits', async () => {
		const child = new EventEmitter();
		const outcome = waitUntilReady(child, 5000);
		child.emit('exit', 1, null);
		expect(await outcome).toEqual({ kind: 'exited' });
	});

	it('passes on the error when the child could not be started', async () => {
		const child = new EventEmitter();
		const outcome = waitUntilReady(child, 5000);
		const error = new Error('spawn EACCES');
		child.emit('error', error);
		expect(await outcome).toEqual({ kind: 'failed', error });
	});

	it('times out when the child says nothing', async () => {
		const child = new EventEmitter();
		expect(await waitUntilReady(child, 50)).toEqual({ kind: 'timeout' });
		expect(child.listenerCount('exit')).toBe(0);
	});
});

describe('stopCommand', () => {
	it('names npx when run by npx', () => {
		expect(stopCommand({ npm_command: 'exec' })).toBe('npx llmspy stop');
		expect(stopCommand({})).toBe('llmspy stop');
	});
});

describe('failureMessage', () => {
	it('says why the start failed', () => {
		expect(
			failureMessage(
				{ kind: 'failed', error: new Error('spawn EACCES') },
				7,
			),
		).toBe('Could not start LLMSpy: spawn EACCES');
		expect(failureMessage({ kind: 'exited' }, 7)).toBe(
			'LLMSpy did not start.',
		);
	});

	it('says whether a process that timed out was stopped', () => {
		expect(failureMessage({ kind: 'timeout', stopped: true }, 7)).toBe(
			'LLMSpy did not start within 60 s, so it was stopped.',
		);
		expect(failureMessage({ kind: 'timeout', stopped: false }, 7)).toBe(
			'LLMSpy did not start within 60 s and may still be running (pid 7).',
		);
	});
});

describe('lastLines', () => {
	it('keeps the last lines, without the trailing newline', () => {
		expect(lastLines('a\nb\nc\n', 2)).toBe('b\nc');
		expect(lastLines('')).toBe('');
	});
});

describe('loaderArgs', () => {
	it('keeps loaders in both forms and drops every other flag', () => {
		expect(
			loaderArgs([
				'--require',
				'/tsx/preflight.cjs',
				'--inspect',
				'--import=file:///tsx/loader.mjs',
				'--max-old-space-size=512',
				'-r',
				'x.cjs',
				'--inspect-brk=9230',
			]),
		).toEqual([
			'--require',
			'/tsx/preflight.cjs',
			'--import=file:///tsx/loader.mjs',
			'-r',
			'x.cjs',
		]);
	});

	it('drops a loader flag that has no value', () => {
		expect(loaderArgs(['--import'])).toEqual([]);
	});
});

describe('waitForExit', () => {
	const fakeChild = () =>
		Object.assign(new EventEmitter(), {
			exitCode: null as number | null,
			signalCode: null as NodeJS.Signals | null,
		});

	it('is true at once for a child that has exited', async () => {
		const child = fakeChild();
		child.exitCode = 0;
		expect(await waitForExit(child, 5000)).toBe(true);
	});

	it('is true when the child exits in time, false when it does not', async () => {
		const child = fakeChild();
		const exited = waitForExit(child, 5000);
		child.emit('exit');
		expect(await exited).toBe(true);
		expect(await waitForExit(fakeChild(), 50)).toBe(false);
	});
});
