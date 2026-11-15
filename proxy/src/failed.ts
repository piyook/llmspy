import type { CallSummary } from './types.js';

/**
 * Whether a call went wrong: the capture's own error (the upstream could not
 * be reached, the stream broke off, LLMSpy stopped while it ran), an HTTP
 * status of 400 or above, or an error the provider sent inside the reply.
 * The UI imports this file too, so it imports types only.
 */
export function isFailed({
	error,
	response,
	llm,
}: Pick<CallSummary, 'error' | 'response' | 'llm'>): boolean {
	return (
		error !== undefined ||
		(response?.status ?? 0) >= 400 ||
		llm?.error !== undefined
	);
}
