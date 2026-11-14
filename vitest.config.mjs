import { defineConfig } from 'vitest/config';

// Only for `npm run test:coverage`: both workspaces in one run, so fallow
// gets a single coverage file for both. `npm test` still runs each
// workspace on its own.
export default defineConfig({
	test: {
		projects: ['proxy', 'ui'],
		coverage: {
			provider: 'v8',
			include: ['proxy/src/**', 'ui/src/**'],
			exclude: ['**/*.test.ts'],
			reporter: ['text-summary', 'json'],
		},
	},
});
