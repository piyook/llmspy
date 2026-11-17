import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';

/**
 * Settings for the `llmspy` command, kept next to the database. Not a `.env`
 * in the current folder: that is usually an app's, with its API keys.
 */
export const ENV_FILE = path.join(homedir(), '.llmspy', '.env');

/**
 * Reads `file` into process.env if it exists, and says whether it did. A
 * variable already set (in the shell) is left as it is, so it wins.
 */
export function loadEnvFile(file = ENV_FILE): boolean {
	if (!existsSync(file)) return false;
	process.loadEnvFile(file);
	return true;
}
