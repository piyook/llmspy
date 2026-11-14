// Type-only, so nothing from the proxy ends up in the UI bundle.
export type {
	LlmExchange,
	LlmMessage,
	LlmPart,
	LlmUsage,
} from '../../../proxy/src/parsers/types.js';
export type { CapturedRequest } from '../../../proxy/src/types.js';

/** The views of the selected request. */
export type Tab = 'conversation' | 'raw' | 'compare';
