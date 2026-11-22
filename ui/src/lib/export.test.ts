import { describe, expect, it } from 'vitest';
import { exportUrl } from './export.js';

describe('exportUrl', () => {
	it('exports the project alone when nothing narrows the list', () => {
		expect(
			exportUrl({ project: 'general', search: '', failedOnly: false }),
		).toBe('/api/export?project=general');
	});

	it('carries the search, the Failed chip and a minutes chip', () => {
		expect(
			exportUrl({
				project: 'my-app',
				search: 'weather & more',
				failedOnly: true,
				since: 1000,
			}),
		).toBe(
			'/api/export?project=my-app&q=weather+%26+more&failed=1&since=1000',
		);
	});
});
