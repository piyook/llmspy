#!/usr/bin/env node
// The `llmspy` command. The Node version is checked before anything that
// needs a recent Node is loaded, so an old one gets a clear message rather
// than a stack trace.
import { helpText, nodeVersionError, parseCommand } from './command.js';
import { readVersion } from './version.js';

const tooOld = nodeVersionError(process.versions.node);
if (tooOld) {
	console.error(tooOld);
	process.exit(1);
}

const args = process.argv.slice(2);
switch (parseCommand(args)) {
	case 'background': {
		const { startInBackground } = await import('./background.js');
		process.exitCode = await startInBackground();
		break;
	}
	case 'start': {
		const { ENV_FILE, loadEnvFile } = await import('./envfile.js');
		try {
			if (loadEnvFile()) console.log(`Settings read from ${ENV_FILE}`);
		} catch (error) {
			console.error(
				`Could not read ${ENV_FILE}: ${(error as Error).message}`,
			);
			process.exit(1);
		}
		await import('./index.js');
		break;
	}
	case 'stop': {
		const { stop } = await import('./stop.js');
		process.exitCode = await stop();
		break;
	}
	case 'help':
		console.log(helpText(readVersion()));
		break;
	case 'version':
		console.log(readVersion());
		break;
	default:
		console.error(`Unknown command: ${args.join(' ')}\n`);
		console.error(helpText(readVersion()));
		process.exitCode = 1;
}
