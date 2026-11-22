# CLI

The `llmspy` command, from npm (`npx llmspy`, or `llmspy` once installed with `npm install -g llmspy`), works in any folder:

| Command            | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `llmspy`           | Start LLMSpy in the foreground                                      |
| `llmspy -b`        | Start LLMSpy in the background (`--background`)                     |
| `llmspy stop`      | Stop LLMSpy started with `llmspy` or `npm start`, from any terminal |
| `llmspy --help`    | List the commands and the settings                                  |
| `llmspy --version` | Print the version                                                   |

Settings are environment variables, not flags: see [Configuration](/reference/configuration).

## Foreground and background

`llmspy` stays in the foreground on purpose: a hidden process capturing your traffic should be a choice you make. Stop it with Ctrl+C, or `llmspy stop` from any terminal.

`llmspy --background` returns once LLMSpy is listening. It prints the UI address and base URLs, the pid, the log file and the command that stops it.

- Its output goes to `~/.llmspy/llmspy.log`. A start that succeeds moves the last log to `llmspy.log.old`; one that fails leaves its output in `llmspy.log.new` and prints the end of it.
- If an LLMSpy is already running, it says so and starts no other.
- It exits `1` if LLMSpy can't start (a port in use, a bad setting) or isn't listening within 60 seconds.

## Stop

`llmspy stop` stops the LLMSpy started with `llmspy`, `llmspy -b`, `npm start` or `npm run dev`, from any terminal. It finds it through `~/.llmspy/llmspy.pid`, and stops it only if that process answers as LLMSpy, so nothing else is killed. It does not stop Docker: use `npm run stop:docker`.

## In a clone of the repo

| Command                         | What it does                                                         |
| ------------------------------- | -------------------------------------------------------------------- |
| `npm install`                   | Install the packages, for running without Docker                     |
| `npm run build`                 | Build the proxy and the UI (again after each update)                 |
| `npm start`                     | Start LLMSpy in the foreground                                       |
| `npm run stop`                  | Stop LLMSpy started with `npm start`, from any terminal              |
| `npm run dev`                   | The proxy and the UI with reload (UI also on `http://localhost:3000`) |
| `npm run start:docker`          | Build the image and start LLMSpy in Docker, in the background         |
| `npm run stop:docker`           | Stop and remove the container; captured calls stay in the volume      |
| `npm run mock`                  | Start the mock Anthropic and OpenAI APIs (see [Testing with mock data](/guide/mock-data)) |
| `node scripts/mock-traffic.mjs` | Send a set of sample calls through LLMSpy to the mocks               |
