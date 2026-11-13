# LLMSpy

A local developer tool that shows LLM API traffic in real time.

## Why

Apps and agents built on LLMs hide most of what they send. SDKs, frameworks and coding agents add their own system prompts, tool definitions, retries and parameters, and the actual request and response are rarely logged anywhere you can read them. When an agent misbehaves, burns tokens, or gives a strange answer, the first question is "what did it actually send to the model, and what came back?", and that is usually the hardest one to answer.

LLMSpy answers it without changing any code. It runs on your machine as a small reverse proxy: point an app's base URL at it (most LLM SDKs and tools read one from an environment variable, such as `ANTHROPIC_BASE_URL` or `OPENAI_BASE_URL`), and every call shows up live in a web UI with the full headers, prompt, parameters, response, status and timing. Streamed responses still stream to the app; LLMSpy keeps a copy as they pass.

Use it to:

- see the real prompts, system messages and tool schemas a library or agent sends
- debug failing or odd requests: errors, status codes, latency
- understand token-heavy calls and why they cost what they do
- compare what different tools send for the same task

It is for local development only. It listens on `127.0.0.1`, masks API keys in what it records, and keeps the last 500 requests in memory only.

## Quick start

```bash
npm install
npm run dev
```

This starts the proxy on `http://127.0.0.1:8080` and the web UI on `http://localhost:3000`.

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

Each request then appears in the UI at `http://localhost:3000`.

## Configuration

| Variable           | Default | Meaning                                                    |
| ------------------ | ------- | ---------------------------------------------------------- |
| `PROXY_PORT`       | `8080`  | Proxy port                                                 |
| `UI_PORT`          | `3000`  | UI port shown in the startup message                       |
| `LLMSPY_UPSTREAMS` |         | Extra or replacement upstreams, as comma-separated `name=url` |

`LLMSPY_UPSTREAMS` adds a prefix per entry, and a name that matches a default replaces it. A path in the URL is kept, and the rest of the request path is appended to it:

```bash
LLMSPY_UPSTREAMS=ollama=http://localhost:11434,gemini=https://generativelanguage.googleapis.com
# http://127.0.0.1:8080/ollama/api/chat -> http://localhost:11434/api/chat
```

Names are lowercase letters, digits and dashes; `api`, `events` and `ping` are taken by LLMSpy itself.

## How it works

- `proxy/`: one Node HTTP server. `/<prefix>/...` is forwarded to the upstream with the bytes unchanged, chunk by chunk, while a copy of each body is kept, decompressed (gzip, deflate, br, zstd) and decoded for display. `/events` (Server-Sent Events), `/api/requests` and `/api/clear` serve the UI.
- `ui/`: Svelte and Vite.

## Development

| Command             | What it does                        |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Proxy and UI with reload            |
| `npm run build`     | Build both packages                 |
| `npm start`         | Run the built proxy                 |
| `npm test`          | Run the tests                       |
| `npm run lint`      | Biome lint and format check         |
| `npm run typecheck` | `tsc` for the proxy, `svelte-check` for the UI |

## Troubleshooting

- **The app still calls the provider directly.** Check that it reads the base URL variable you set, and that it was started after you set it.
- **404 from LLMSpy.** The path prefix doesn't match an upstream; the response lists the known ones.
- **502 from LLMSpy.** The upstream could not be reached; the request in the UI shows the error.

## License

MIT License - see LICENSE file for details.
