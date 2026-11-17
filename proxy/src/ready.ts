// Between `llmspy --background` (background.ts) and the LLMSpy it starts: the
// background process says it is listening with one message on the IPC channel.
// Kept apart from background.ts so the server does not load the launcher.

/** Set for the background process, which then reports on the IPC channel. */
export const BACKGROUND_ENV = 'LLMSPY_BACKGROUND';
export const READY = 'llmspy:ready';

/** Run by LLMSpy once it listens: tells `llmspy --background` it is ready. */
export function notifyReady(): void {
	if (process.env[BACKGROUND_ENV] !== '1' || !process.connected) return;
	// The launcher may have gone (Ctrl+C, a command timeout): with a callback,
	// a send that fails is ignored rather than crashing LLMSpy.
	process.send?.({ type: READY }, undefined, undefined, () => {});
}
