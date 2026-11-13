import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [svelte()],
	server: {
		port: 3000,
		// In dev the UI calls the proxy through Vite, so it can use the same
		// relative URLs as when the proxy serves the built UI.
		proxy: {
			'/api': 'http://127.0.0.1:8080',
			'/events': 'http://127.0.0.1:8080',
			'/ping': 'http://127.0.0.1:8080',
		},
	},
});
