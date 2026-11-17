import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// proxy/package.json, from src/ (tsx) and dist/ alike; the image and the npm
// package ship it too. A URL rather than import.meta.dirname, so that the CLI
// can load this module on an old Node and still say which version it needs.
const packageFile = fileURLToPath(new URL('../package.json', import.meta.url));

/** LLMSpy's version, from proxy/package.json. */
export function readVersion(): string {
	const { version } = JSON.parse(readFileSync(packageFile, 'utf8'));
	if (typeof version !== 'string') {
		throw new Error(`No version in ${packageFile}`);
	}
	return version;
}
