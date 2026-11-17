import { describe, expect, it } from 'vitest';
import { hostForUrl, isAllowedUiRequest } from './guard.js';

describe('hostForUrl', () => {
	it.each([
		['127.0.0.1', '127.0.0.1'],
		['localhost', 'localhost'],
		['::1', '[::1]'],
		['[::1]', '[::1]'],
	])('writes %s as %s', (host, expected) => {
		expect(hostForUrl(host)).toBe(expected);
	});
});

describe('isAllowedUiRequest', () => {
	it.each([
		'127.0.0.1:8080',
		'localhost:8080',
		'[::1]:8080',
		'LOCALHOST:3000',
		'127.0.0.1',
	])('allows Host %s with no Origin', (host) => {
		expect(isAllowedUiRequest({ host }, '127.0.0.1')).toBe(true);
	});

	it.each([
		'evil.example:8080',
		'127.0.0.1.evil.example',
		'localhost.evil.example:8080',
		'192.168.1.20:8080',
		'',
		'bad host',
	])('refuses Host %j', (host) => {
		expect(isAllowedUiRequest({ host }, '127.0.0.1')).toBe(false);
	});

	it('refuses a request with no Host', () => {
		expect(isAllowedUiRequest({}, '127.0.0.1')).toBe(false);
	});

	it('allows the address LLMSpy listens on', () => {
		const headers = { host: '192.168.1.20:8080' };
		expect(isAllowedUiRequest(headers, '192.168.1.20')).toBe(true);
	});

	it('allows an IPv6 address LLMSpy listens on', () => {
		const headers = { host: '[fd00::5]:8080' };
		expect(isAllowedUiRequest(headers, 'fd00::5')).toBe(true);
	});

	it('does not treat a wildcard listen address as a host name', () => {
		expect(isAllowedUiRequest({ host: '0.0.0.0:8080' }, '0.0.0.0')).toBe(
			false,
		);
	});

	it('allows an Origin that is the same origin as Host', () => {
		const headers = {
			host: 'localhost:3000',
			origin: 'http://localhost:3000',
		};
		expect(isAllowedUiRequest(headers, '127.0.0.1')).toBe(true);
	});

	it.each([
		'http://evil.example',
		'http://localhost:5173',
		'http://127.0.0.1:3000',
		'https://localhost:3000',
		'null',
		'not a url',
	])('refuses Origin %s', (origin) => {
		const headers = { host: 'localhost:3000', origin };
		expect(isAllowedUiRequest(headers, '127.0.0.1')).toBe(false);
	});
});
