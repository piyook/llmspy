import { describe, expect, it } from 'vitest';
import { helpText, nodeVersionError, parseCommand } from './command.js';

describe('parseCommand', () => {
	it('starts with no arguments', () => {
		expect(parseCommand([])).toBe('start');
	});

	it.each([
		['--background', 'background'],
		['-b', 'background'],
		['stop', 'stop'],
		['help', 'help'],
		['--help', 'help'],
		['-h', 'help'],
		['--version', 'version'],
		['-v', 'version'],
	])('reads %s as %s', (arg, command) => {
		expect(parseCommand([arg])).toBe(command);
	});

	it('refuses anything else', () => {
		expect(parseCommand(['start'])).toBeUndefined();
		expect(parseCommand(['--port'])).toBeUndefined();
		expect(parseCommand(['stop', 'now'])).toBeUndefined();
		expect(parseCommand(['-b', 'stop'])).toBeUndefined();
	});
});

describe('nodeVersionError', () => {
	it('accepts Node 26 and later', () => {
		expect(nodeVersionError('26.0.0')).toBeUndefined();
		expect(nodeVersionError('27.1.2')).toBeUndefined();
	});

	it('names the version needed and the one found', () => {
		expect(nodeVersionError('24.11.1')).toBe(
			'LLMSpy needs Node.js 26 or later; this is Node.js 24.11.1.',
		);
	});
});

describe('helpText', () => {
	it('shows the version and the commands', () => {
		const text = helpText('1.2.3');
		expect(text).toContain('LLMSpy 1.2.3');
		expect(text).toContain('llmspy stop');
		expect(text).toContain('llmspy --background');
	});
});
