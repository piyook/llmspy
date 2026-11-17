import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyReady, stopCommand, waitUntilReady } from './background.js';

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

describe('notifyReady', () => {
	const send = process.send;
	afterEach(() => {
		process.send = send;
		vi.unstubAllEnvs();
	});

	it('reports only in a process started by llmspy --background', () => {
		const fake = vi.fn(() => true);
		process.send = fake;
		notifyReady();
		expect(fake).not.toHaveBeenCalled();

		vi.stubEnv('LLMSPY_BACKGROUND', '1');
		notifyReady();
		expect(fake).toHaveBeenCalledWith({ type: 'llmspy:ready' });
	});
});
