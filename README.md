# LLMSpy

A lightweight local developer tool that shows LLM API traffic in real time, with next to no setup.

- **Live capture**: every call to Anthropic, OpenAI or any other upstream you add shows up as soon as it is sent and is filled in when the reply ends, and streamed replies still stream to the app
- **Conversation view**: system prompt, tools, messages, tool calls matched to their results, and the reply with its stop reason and token use
- **Raw view**: headers and bodies exactly as sent and received, with API keys masked
- **Compare**: diff a call against the one before it, or any other, to see what an agent changed between turns
- **Projects**: tag each app's base URL to give its calls their own tab
- **Reads three formats**: Anthropic Messages, OpenAI Chat Completions and OpenAI Responses, streamed or not
- **Kept across restarts**: the last 7 days of calls, in one file on your machine, listed by day with older days folded away, and today's narrowed to the last 5 to 90 minutes in one click
- **Lightweight**: one command to start, one base URL to set in your app; no certificates or accounts

![LLMSpy showing a coding agent's call as a conversation: the user's question, the assistant's tool calls and the tool results](docs/screenshots/conversation.png)

## Why

Apps and agents built on LLMs hide most of what they send. SDKs, frameworks and coding agents add their own system prompts, tool definitions, retries and parameters, and the actual request and response are rarely logged anywhere you can read them. When an agent misbehaves, burns tokens, or gives a strange answer, the first question is "what did it actually send to the model, and what came back?", and that is usually the hardest one to answer.

LLMSpy answers it without changing any code. It runs on your machine as a small reverse proxy: point an app's base URL at it (most LLM SDKs and tools read one from an environment variable, such as `ANTHROPIC_BASE_URL` or `OPENAI_BASE_URL`), and every call shows up live in a web UI with the full headers, prompt, parameters, response, status and timing. Streamed responses still stream to the app; LLMSpy keeps a copy as they pass.

Use it to:

- see the real prompts, system messages and tool schemas a library or agent sends
- debug failing or odd requests: errors, status codes, latency
- understand token-heavy calls and why they cost what they do
- compare what different tools send for the same task

It is deliberately small, and quick to set up:

- one command starts it, and one environment variable in your app points it there
- no certificates to install, no accounts, no API keys of its own and no config file
- the proxy has no runtime dependencies beyond Node.js (it stores calls with the SQLite built into Node), and the UI is plain static files it serves itself, on the same port

It is for local development only. It listens on `127.0.0.1`, masks API keys in what it records, and keeps the last 7 days of calls in a file on your machine (see [Storage](#storage)).

## What you see

Every call appears in the list on the left as soon as it is sent, newest first, with its status, time taken and token counts. A call still running is marked `waiting` or `replying` with a running timer; its reply shows once it ends. Select one to look at it three ways.

**Conversation** (above) reads the call as the model sees it: the system prompt and tools, then each message by role, with tool calls matched to their results, and the reply at the end with its stop reason and token use. Streamed replies are put back together. LLMSpy reads the Anthropic Messages, OpenAI Chat Completions and OpenAI Responses formats.

**Raw** shows the request and response exactly as they went over the wire: method and URL, headers (with API keys masked) and both bodies.

![The Raw tab: request headers with the API key masked, and the request body as JSON](docs/screenshots/raw.png)

**Compare** sets the selected call (green) against another (red): by default the previous call to the same upstream, which in an agent loop is the turn before; "Compare with another call" picks any other. It sums up what changed (model, stop reason, system prompt, tools, messages and tokens) and shows only the messages that are new.

![The Compare tab: the system prompt's one changed line, token counts for both calls, and the two messages the later call added](docs/screenshots/compare.png)

Under the summary, a line diff of the two request bodies shows everything else that changed, such as `max_tokens`, `temperature` or a tool's schema, with unchanged stretches folded away.

![The request body diff in the Compare tab, with the added messages in green and the changed system prompt in red and green](docs/screenshots/compare-body.png)

The traffic in these screenshots is made up, sent to the mock server described under [Testing without an API key](#testing-without-an-api-key).

## Quick start

Running LLMSpy without Docker needs **Node.js 26 or later** (`node --version`); the Docker image brings its own.

With Docker:

```bash
npm run start:docker   # docker compose up -d --build
```

LLMSpy then runs in the background, restarts with Docker, and serves the proxy and the UI on `http://127.0.0.1:8080`. The port is published on the loopback interface only, so nothing outside your machine can reach it. Captured traffic (`/api/*`, `/events`, `/ping`) is only served to requests addressed to `localhost`, `127.0.0.1` or `[::1]`, and not to other web sites open in your browser. `npm run stop:docker` (`docker compose down`) stops it; captured calls are kept in the `llmspy-data` volume and are there again at the next start (`docker compose down -v` deletes them).

Then point an app at the proxy by the provider's path prefix:

| Prefix       | Forwards to                 | Example                                              |
| ------------ | --------------------------- | ---------------------------------------------------- |
| `/anthropic` | `https://api.anthropic.com` | `ANTHROPIC_BASE_URL=http://127.0.0.1:8080/anthropic` |
| `/openai`    | `https://api.openai.com`    | `OPENAI_BASE_URL=http://127.0.0.1:8080/openai/v1`    |

For example, in PowerShell:

```powershell
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8080/anthropic"
claude
```

Each request then appears in the UI at `http://127.0.0.1:8080`.

To keep each app's calls apart, put `/@<project>` in front of the prefix. Each project gets its own tab in the UI, and the tag is not forwarded:

```powershell
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8080/@my-app/anthropic"
```

Calls without a tag go to `general`. A project name is lowercase letters, digits and dashes, like an upstream name. The tabs appear once there is a project besides `general`; a tab you are not viewing counts its new calls. A search looks in every project: while it is on, each tab counts its matches instead. Clear All empties only the project you are viewing.

![Project tabs under the header: general, site-agent (selected, its three calls listed) and support-bot with a badge for two new calls](docs/screenshots/projects.png)

For coding agents and scripts, [llms.txt](llms.txt) is a compact reference: how to run LLMSpy, point an app at it, and read the captured traffic as JSON.

## Upstreams

An upstream is an API that LLMSpy forwards to, reached through its own path prefix. The real Anthropic and OpenAI APIs are built in (`/anthropic` and `/openai`, see [Quick start](#quick-start)) and need no setup: the app keeps its own API key, which LLMSpy passes on to the provider. The ChatGPT app itself can't be pointed anywhere; `/openai` is for code and tools that call the OpenAI API.

### Adding one

Set `LLMSPY_UPSTREAMS` to a comma-separated list of `name=url` before starting LLMSpy. Each entry adds the prefix `/<name>`, and a name that is already there replaces it. A path in the URL is kept and the rest of the request path is appended to it, so the app's base URL is LLMSpy's address plus the prefix:

```
LLMSPY_UPSTREAMS=openrouter=https://openrouter.ai/api/v1
app's base URL:   http://127.0.0.1:8080/openrouter
app calls:        http://127.0.0.1:8080/openrouter/chat/completions
LLMSpy sends to:  https://openrouter.ai/api/v1/chat/completions
```

Names are lowercase letters, digits and dashes; `api`, `assets`, `events` and `ping` are taken by LLMSpy itself. LLMSpy reads the conversation from any upstream that speaks the Anthropic Messages, OpenAI Chat Completions or OpenAI Responses API, whatever its name; calls to other APIs are still captured and shown in Raw.

Examples, with the base URL to give the app:

| `LLMSPY_UPSTREAMS` entry                                         | App's base URL                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `openrouter=https://openrouter.ai/api/v1`                        | `http://127.0.0.1:8080/openrouter`                            |
| `gemini=https://generativelanguage.googleapis.com/v1beta/openai` | `http://127.0.0.1:8080/gemini` (OpenAI SDK)                   |
| `ollama=http://localhost:11434`                                  | `http://127.0.0.1:8080/ollama/v1` (OpenAI SDK)                |
| `anthropic=https://llm-gateway.example.com/anthropic`            | `http://127.0.0.1:8080/anthropic` (replaces the built-in one) |

### Running locally

Put the variable in a `.env` file at the root of the repo (copy `.env.example` to start); `npm start` and `npm run dev` read it. Or set it in the shell that starts LLMSpy, which wins over `.env`. In PowerShell:

```powershell
$env:LLMSPY_UPSTREAMS = "openrouter=https://openrouter.ai/api/v1,ollama=http://localhost:11434"
npm start
```

In bash:

```bash
LLMSPY_UPSTREAMS=openrouter=https://openrouter.ai/api/v1,ollama=http://localhost:11434 npm start
```

### With Docker

Put the variable in a `.env` file next to `compose.yaml` (copy `.env.example` to start). Compose reads it and passes `LLMSPY_UPSTREAMS` and `LLMSPY_RETENTION_DAYS`, and nothing else from it, into the container. Then start the container, which recreates it if the value has changed:

```bash
# .env
LLMSPY_UPSTREAMS=openrouter=https://openrouter.ai/api/v1,ollama=http://host.docker.internal:11434
```

```bash
npm run start:docker
```

Inside the container `localhost` is the container itself, so an upstream running on your machine, such as Ollama or the [mocks](#testing-without-an-api-key), is `host.docker.internal`. External URLs are the same as when running locally, and apps are still pointed at `http://127.0.0.1:8080/<name>` from your machine.

The same `.env` serves both, except for upstreams on your machine: a local run reaches them at `localhost`, Docker at `host.docker.internal`. If you switch between the two, override the variable in the shell for local runs.

### Checking them

LLMSpy prints every upstream and its base URL on startup (`docker compose logs` with Docker), lists them under **Base URLs** in the UI's header, and returns them at `GET /api/upstreams`. A name that isn't allowed or a URL that isn't valid stops it at startup with the reason.

## Configuration

| Variable                | Default     | Meaning                                                      |
| ----------------------- | ----------- | ------------------------------------------------------------ |
| `PROXY_PORT`            | `8080`      | Port for the proxy and the UI                                |
| `LLMSPY_HOST`           | `127.0.0.1` | Interface to listen on; the Docker image sets `0.0.0.0`      |
| `LLMSPY_UPSTREAMS`      |             | Extra or replacement upstreams, see [Upstreams](#upstreams)  |
| `LLMSPY_RETENTION_DAYS` | `7`         | Days to keep captured calls; `0` keeps them until cleared    |

### Storage

Captured calls are kept in `~/.llmspy/llmspy.db` (with Docker, in the `llmspy-data` volume), so they are still there after a restart. LLMSpy prints where, and for how long, on startup. Calls older than `LLMSPY_RETENTION_DAYS` are removed at startup and every hour after. Clear All and the delete button remove calls from the file too. A call still running when LLMSpy stopped is shown as interrupted.

The file holds whole prompts and replies (API keys are masked), so treat it like the traffic itself: it stays on your machine, and deleting it while LLMSpy is stopped removes every call.

## How it works

- `proxy/`: one Node HTTP server. `/<prefix>/...` (or `/@<project>/<prefix>/...`) is forwarded to the upstream with the bytes unchanged, chunk by chunk, while a copy of each body is kept, decompressed (gzip, deflate, br, zstd) and decoded for display. `/events` (Server-Sent Events of call summaries), `/api/requests` (summaries, with `?project=`, `?q=` search, `?since=`, `?limit=` and `?full=1` for full records), `GET`/`DELETE /api/requests/<id>` (one full record), `/api/upstreams` (each prefix and where it forwards to) and `/api/clear` serve the UI, and any other path is a file from the built UI (`ui/dist`). Calls are stored with `node:sqlite`; a running call is held in memory and written when it starts, when its response headers arrive and when it ends.
- `ui/`: Svelte and Vite.

## Development

Needs Node.js 26 or later, as set in `engines` in `package.json`.

```bash
npm install
npm run dev
```

This starts the proxy on `http://127.0.0.1:8080` and the web UI, with live reload, on `http://localhost:3000`. Stop the Docker container first, as both use port 8080. `npm run build` then `npm start` runs the built proxy, which serves the built UI itself at `http://127.0.0.1:8080/`. `npm run stop`, from any terminal, stops it: on startup the proxy writes its pid to `~/.llmspy/llmspy.pid`.

| Command                 | What it does                                                                   |
| ----------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`           | Proxy and UI with reload                                                       |
| `npm run build`         | Build both packages                                                            |
| `npm start`             | Run the built proxy                                                            |
| `npm run stop`          | Stop the proxy started with `npm start`                                        |
| `npm run start:docker`  | Build and start the Docker container                                           |
| `npm run stop:docker`   | Stop and remove the Docker container                                           |
| `npm test`              | Run the tests                                                                  |
| `npm run test:coverage` | Run all the tests in one go and write `coverage/`                              |
| `npm run test:e2e`      | Run the proxy in front of a real [llmock](https://www.npmjs.com/package/llmock) (also run before a push and on pull requests) |
| `npm run lint`          | Biome lint and format check                                                    |
| `npm run typecheck`     | `tsc` for the proxy, `svelte-check` for the UI                                 |
| `npm run fallow`        | [fallow](https://fallow.tools) report on the whole codebase (after `test:coverage`) |
| `npm run fallow:audit`  | fallow on this branch's changes only, as the pre-push hook and CI run it       |
| `npm run mock`          | Mock LLM APIs for testing (below)                                              |

### Testing without an API key

`npm run mock` starts two [llmock](https://www.npmjs.com/package/llmock) servers, with their config in `mock/.llmockrc.json`: the Anthropic Messages API on `http://127.0.0.1:8001` and OpenAI Chat Completions on `http://127.0.0.1:8002`. They reply with generated text, so no key or network is needed. Point LLMSpy at them, then send traffic:

```bash
LLMSPY_UPSTREAMS=llmock=http://127.0.0.1:8001,llmock-openai=http://127.0.0.1:8002 npm run dev
node scripts/mock-traffic.mjs
```

The script sends one request of each kind below. To use the mocks from your own client, set its base URL to `http://127.0.0.1:8080/llmock` (Anthropic) or `http://127.0.0.1:8080/llmock-openai/v1` (OpenAI), with any non-empty key. A marker in the last message picks the reply:

| Marker          | Reply                                                       |
| --------------- | ----------------------------------------------------------- |
| `#tools`        | A `get_weather` tool call (Anthropic); a tool result containing `sunny` gets the final answer |
| `#max-tokens`   | A reply cut off at the token limit                           |
| `#refusal`      | A refusal                                                    |
| `#rate-limit`   | HTTP 429                                                     |
| `#stream-error` | A stream that sends an error event part-way through          |
| `#stream-drop`  | A stream whose connection is cut part-way through            |

Anything else gets random lorem ipsum. Both mocks stream when the request sets `"stream": true`.

## Troubleshooting

- **The app still calls the provider directly.** Check that it reads the base URL variable you set, and that it was started after you set it.
- **404 from LLMSpy.** The path prefix doesn't match an upstream; the response lists the known ones.
- **502 from LLMSpy.** The upstream could not be reached; the request in the UI shows the error.

## License

MIT, see [LICENSE](LICENSE).
