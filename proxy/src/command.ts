// What the `llmspy` command was asked to do. Kept apart from cli.ts so it can
// be tested, and free of anything newer than old Node versions can load, as
// the CLI runs it before the version check has passed.

/** The oldest Node major LLMSpy runs on: node:sqlite loads with no warning from 26. */
const MIN_NODE_MAJOR = 26;

type Command = 'start' | 'stop' | 'help' | 'version';

/** The command in `args` (argv after the script), or undefined if it is not one. */
export function parseCommand(args: readonly string[]): Command | undefined {
	if (args.length === 0) return 'start';
	if (args.length > 1) return undefined;
	switch (args[0]) {
		case 'stop':
			return 'stop';
		case 'help':
		case '--help':
		case '-h':
			return 'help';
		case '--version':
		case '-v':
			return 'version';
		default:
			return undefined;
	}
}

/** Why LLMSpy can't run on this Node `version`, or undefined if it can. */
export function nodeVersionError(version: string): string | undefined {
	const major = Number.parseInt(version, 10);
	if (major >= MIN_NODE_MAJOR) return undefined;
	return `LLMSpy needs Node.js ${MIN_NODE_MAJOR} or later; this is Node.js ${version}.`;
}

export function helpText(version: string): string {
	return `LLMSpy ${version}: shows LLM API traffic live, in a web UI on your machine.

Usage:
  llmspy             start LLMSpy in the foreground (Ctrl+C stops it)
  llmspy stop        stop the LLMSpy running on this machine
  llmspy --version   print the version
  llmspy --help      show this

Settings are environment variables, set in the shell or in ~/.llmspy/.env
(the shell wins):
  PROXY_PORT             port for the proxy and the UI (8080)
  LLMSPY_HOST            interface to listen on (127.0.0.1)
  LLMSPY_UPSTREAMS       extra upstreams, as name=url,...
  LLMSPY_RETENTION_DAYS  days to keep captured calls, 0 for ever (7)

Docs: https://github.com/piyook/llmspy`;
}
