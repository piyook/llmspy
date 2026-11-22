# Upstreams

An upstream is an API that LLMSpy forwards to, reached through its own path prefix. The real Anthropic and OpenAI APIs are built in and need no setup:

| Prefix       | Forwards to                 |
| ------------ | --------------------------- |
| `/anthropic` | `https://api.anthropic.com` |
| `/openai`    | `https://api.openai.com`    |

The ChatGPT app itself can't be pointed anywhere; `/openai` is for code and tools that call the OpenAI API.

## Adding an upstream

Set `LLMSPY_UPSTREAMS` to a comma-separated list of `name=url` before starting LLMSpy. Each entry adds the prefix `/<name>`. A path in the URL is kept and the rest of the request path is appended to it, so the app's base URL is LLMSpy's address plus the prefix:

```
LLMSPY_UPSTREAMS=openrouter=https://openrouter.ai/api/v1
app's base URL:   http://127.0.0.1:8080/openrouter
app calls:        http://127.0.0.1:8080/openrouter/chat/completions
LLMSpy sends to:  https://openrouter.ai/api/v1/chat/completions
```

Examples, with the base URL to give the app:

| `LLMSPY_UPSTREAMS` entry                                         | App's base URL                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `openrouter=https://openrouter.ai/api/v1`                        | `http://127.0.0.1:8080/openrouter`                            |
| `gemini=https://generativelanguage.googleapis.com/v1beta/openai` | `http://127.0.0.1:8080/gemini` (OpenAI SDK)                   |
| `ollama=http://localhost:11434`                                  | `http://127.0.0.1:8080/ollama/v1` (OpenAI SDK)                |
| `anthropic=https://llm-gateway.example.com/anthropic`            | `http://127.0.0.1:8080/anthropic` (replaces the built-in one) |

The rules:

- Names are lowercase letters, digits and dashes. `api`, `assets`, `events` and `ping` are taken by LLMSpy itself.
- A name that is already there (`anthropic`, `openai`) is replaced. Giving the same name twice in `LLMSPY_UPSTREAMS` is an error.
- URLs are `http` or `https`.

LLMSpy reads the conversation from any upstream that speaks the Anthropic Messages, OpenAI Chat Completions or OpenAI Responses API, whatever its name; calls to other APIs are still captured and shown in Raw.

## Setting upstreams for a local run

Set the variable in the shell that starts LLMSpy:

::: code-group

```powershell [PowerShell]
$env:LLMSPY_UPSTREAMS = "openrouter=https://openrouter.ai/api/v1,ollama=http://localhost:11434"
npx llmspy
```

```bash [bash]
LLMSPY_UPSTREAMS=openrouter=https://openrouter.ai/api/v1,ollama=http://localhost:11434 npx llmspy
```

:::

To keep the same settings every time, put them in `~/.llmspy/.env` (the folder that also holds the captured calls) instead, one per line, and `llmspy` reads them whenever it starts:

```bash
# ~/.llmspy/.env
LLMSPY_UPSTREAMS=openrouter=https://openrouter.ai/api/v1,ollama=http://localhost:11434
```

A variable set in the shell wins over the file, so a one-off value doesn't need the file changed. LLMSpy says `Settings read from …` when it starts if it found the file.

::: warning Not the .env in your project
`llmspy` doesn't read a `.env` in the folder you start it from, which is usually an app's own, with its API keys. Keep LLMSpy's settings in `~/.llmspy/.env`.
:::

In a clone of the repo, `npm start` reads a `.env` file at the root of the repo instead (copy `.env.example` to start), and here too the shell wins. For Docker, see [Setting upstreams in Docker](/guide/docker#setting-upstreams-in-docker).

## Checking your upstreams

LLMSpy prints every upstream and its base URL when it starts (`docker compose logs` with Docker), lists them under **Base URLs** in the UI's header, and returns them at `GET /api/upstreams`. A name that isn't allowed or a URL that isn't valid stops it at startup, with the reason.
