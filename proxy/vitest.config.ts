import { configDefaults, defineConfig } from 'vitest/config';

// The end-to-end tests start llmock and run on their own: `npm run test:e2e`
// (vitest.e2e.config.ts).
export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, 'src/e2e/**'],
	},
});
