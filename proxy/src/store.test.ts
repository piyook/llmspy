import { describe, expect, it } from 'vitest';
import { RequestStore } from './store.js';
import type { CapturedRequest } from './types.js';

function call(id: string, path = '/v1/messages'): CapturedRequest {
	return {
		id,
		timestamp: '2026-01-01T00:00:00.000Z',
		provider: 'anthropic',
		host: 'api.anthropic.com',
		method: 'POST',
		path,
		headers: {},
		body: '',
		timings: { start: 0 },
	};
}

const ids = (store: RequestStore) => store.getRequests().map(({ id }) => id);

describe('RequestStore', () => {
	it('keeps requests newest first, up to its cap', () => {
		const store = new RequestStore(2);
		store.addRequest(call('a'));
		store.addRequest(call('b'));
		store.addRequest(call('c'));
		expect(ids(store)).toEqual(['c', 'b']);
	});

	it('replaces a request with the same id where it is', () => {
		const store = new RequestStore();
		store.addRequest(call('a'));
		store.addRequest(call('b'));
		store.addRequest(call('a', '/v1/messages?done'));
		expect(ids(store)).toEqual(['b', 'a']);
		expect(store.getRequests()[1].path).toBe('/v1/messages?done');
	});

	it('removes one request by id, and says whether it was there', () => {
		const store = new RequestStore();
		store.addRequest(call('a'));
		store.addRequest(call('b'));
		store.addRequest(call('c'));
		expect(store.remove('b')).toBe(true);
		expect(ids(store)).toEqual(['c', 'a']);
		expect(store.remove('b')).toBe(false);
		expect(ids(store)).toEqual(['c', 'a']);
	});

	it('adds a request again after it was cleared', () => {
		const store = new RequestStore();
		store.addRequest(call('a'));
		store.clear();
		store.addRequest(call('a'));
		expect(ids(store)).toEqual(['a']);
	});
});
