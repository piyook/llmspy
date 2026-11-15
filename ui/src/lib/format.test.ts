import { describe, expect, it } from 'vitest';
import { formatElapsed, formatTokens } from './format.js';

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

describe('formatTokens', () => {
	it('shows counts, thousands and millions', () => {
		expect(formatTokens(999)).toBe('999');
		expect(formatTokens(1234)).toBe('1.2k');
		expect(formatTokens(999_949)).toBe('999.9k');
		expect(formatTokens(999_950)).toBe('1.0M');
		expect(formatTokens(2_500_000)).toBe('2.5M');
	});

	it('shows ? for a count not reported', () => {
		expect(formatTokens(undefined)).toBe('?');
	});
});
