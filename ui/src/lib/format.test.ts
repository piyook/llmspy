import { describe, expect, it } from 'vitest';
import { formatElapsed } from './format.js';

describe('formatElapsed', () => {
	it('counts whole seconds under a minute', () => {
		expect(formatElapsed(0)).toBe('0s');
		expect(formatElapsed(999)).toBe('0s');
		expect(formatElapsed(42_500)).toBe('42s');
	});

	it('shows minutes and padded seconds from a minute on', () => {
		expect(formatElapsed(60_000)).toBe('1m 00s');
		expect(formatElapsed(185_000)).toBe('3m 05s');
	});

	it('never goes below zero when the clocks disagree', () => {
		expect(formatElapsed(-500)).toBe('0s');
	});
});
