import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyReady } from './ready.js';

describe('notifyReady', () => {
	const send = process.send;
	const connected = Object.getOwnPropertyDescriptor(process, 'connected');
	const setConnected = (value: boolean) =>
		Object.defineProperty(process, 'connected', {
			value,
			configurable: true,
		});

	afterEach(() => {
		process.send = send;
		if (connected) Object.defineProperty(process, 'connected', connected);
		else Reflect.deleteProperty(process, 'connected');
		vi.unstubAllEnvs();
	});

	it('reports only in a process started by llmspy --background', () => {
		const fake = vi.fn(() => true);
		process.send = fake;
		setConnected(true);
		notifyReady();
		expect(fake).not.toHaveBeenCalled();

		vi.stubEnv('LLMSPY_BACKGROUND', '1');
		notifyReady();
		expect(fake).toHaveBeenCalledWith(
			{ type: 'llmspy:ready' },
			undefined,
			undefined,
			expect.any(Function),
		);
	});

	it('does not send once the launcher has gone', () => {
		const fake = vi.fn(() => true);
		process.send = fake;
		vi.stubEnv('LLMSPY_BACKGROUND', '1');
		setConnected(false);
		notifyReady();
		expect(fake).not.toHaveBeenCalled();
	});

	it('ignores a send that fails', () => {
		const fake = vi.fn((..._args: unknown[]) => false);
		process.send = fake;
		vi.stubEnv('LLMSPY_BACKGROUND', '1');
		setConnected(true);
		notifyReady();
		// With a callback, Node hands a failed send to it instead of emitting 'error'.
		const callback = fake.mock.calls[0].at(-1) as (error: Error) => void;
		expect(() => callback(new Error('channel closed'))).not.toThrow();
	});
});
