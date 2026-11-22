import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitepress';

// The site is served from https://llmspy.piyook.com/ (GitHub Pages with a custom domain).
// To serve it from https://piyook.github.io/llmspy/ instead, build with DOCS_BASE=/llmspy/.
const base = process.env.DOCS_BASE ?? '/';
const repo = 'https://github.com/piyook/llmspy';

// GitHub's heading ids, so links written for the README carry over unchanged.
const slugify = (s: string) =>
	s
		.trim()
		.toLowerCase()
		.replace(/<[^>]+>/g, '')
		.replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '')
		.replace(/ /g, '-');

export default defineConfig({
	title: 'LLMSpy',
	description:
		'See the LLM API calls your apps and agents make, live, on your own machine',
	base,
	cleanUrls: true,
	sitemap: { hostname: 'https://llmspy.piyook.com' },
	lastUpdated: true,
	head: [
		[
			'link',
			{ rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` },
		],
		['meta', { name: 'theme-color', content: '#646cff' }],
	],
	markdown: {
		anchor: { slugify },
	},
	// llms.txt is linked from the pages and copied to the site root at build time.
	ignoreDeadLinks: [/\/llms\.txt$/],
	buildEnd(siteConfig) {
		fs.copyFileSync(
			path.resolve(siteConfig.root, '..', 'llms.txt'),
			path.join(siteConfig.outDir, 'llms.txt'),
		);
	},
	themeConfig: {
		logo: '/logo.svg',
		nav: [
			{
				text: 'Get started',
				link: '/guide/getting-started',
				activeMatch: '/guide/',
			},
			{
				text: 'Reference',
				link: '/reference/cli',
				activeMatch: '/reference/',
			},
			{ text: 'Changelog', link: '/changelog' },
			{ text: 'npm', link: 'https://www.npmjs.com/package/llmspy' },
		],
		// Ordered as a reader meets it: start, then the UI, then connecting apps, then the detail.
		// The order also sets each page's Previous / Next links.
		sidebar: [
			{
				text: 'Start here',
				items: [
					{ text: 'Getting started', link: '/guide/getting-started' },
					{ text: 'Installation', link: '/guide/installation' },
				],
			},
			{
				text: 'Using the UI',
				items: [
					{ text: 'The call list', link: '/guide/call-list' },
					{ text: 'Reading a call', link: '/guide/reading-a-call' },
					{ text: 'Comparing calls', link: '/guide/compare' },
					{ text: 'Projects', link: '/guide/projects' },
				],
			},
			{
				text: 'Connect your apps',
				items: [
					{ text: 'Upstreams', link: '/guide/upstreams' },
					{ text: 'Docker', link: '/guide/docker' },
					{
						text: 'Apps without a base URL',
						link: '/guide/without-base-url',
					},
				],
			},
			{
				text: 'Agents and scripts',
				items: [
					{ text: 'Reading calls from code', link: '/guide/agents' },
				],
			},
			{
				text: 'Reference',
				items: [
					{ text: 'CLI', link: '/reference/cli' },
					{ text: 'Configuration', link: '/reference/configuration' },
					{ text: 'HTTP API', link: '/reference/api' },
					{
						text: 'Capture format',
						link: '/reference/capture-format',
					},
					{ text: 'How it works', link: '/reference/how-it-works' },
				],
			},
			{
				text: 'Working on LLMSpy',
				items: [
					{
						text: 'Testing with mock data',
						link: '/guide/mock-data',
					},
				],
			},
			{
				text: 'Help',
				items: [
					{ text: 'Troubleshooting', link: '/troubleshooting' },
					{ text: 'Changelog', link: '/changelog' },
				],
			},
		],
		socialLinks: [{ icon: 'github', link: repo }],
		search: { provider: 'local' },
		outline: { level: [2, 3] },
		editLink: {
			pattern: `${repo}/edit/dev/docs/:path`,
			text: 'Edit this page on GitHub',
		},
		footer: {
			message: 'Released under the MIT License.',
		},
	},
});
