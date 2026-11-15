import { defineConfig } from 'vitest/config';

// `npm run test:e2e`: the proxy in front of a real llmock. Each file starts
// its own llmock, which allows one server per process, and Vitest runs each
// file in its own worker.
export default defineConfig({
	test: {
		include: ['src/e2e/**/*.e2e.test.ts'],
	},
});
