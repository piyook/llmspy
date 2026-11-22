# Getting started

Apps and agents built on LLMs hide most of what they send. SDKs, frameworks and coding agents add their own system prompts, tool definitions, retries and parameters, and the actual request and response are rarely logged anywhere you can read them. When an agent misbehaves, burns tokens or gives a strange answer, the first question is "what did it actually send to the model, and what came back?", and that is usually the hardest one to answer.

LLMSpy answers it without changing any code. It runs on your machine as a small reverse proxy: point an app's base URL at it, and every call shows up live in a web UI with the full headers, prompt, parameters, response, status and timing.

This page takes a couple of minutes: start LLMSpy, point an app at it, look at a call.

## Prerequisites

- [Node.js](https://nodejs.org/) 26 or later (`node --version`), or Docker (see [Installation](/guide/installation))
- An app or tool that lets you set its API base URL, which most LLM SDKs and coding agents do through an environment variable such as `ANTHROPIC_BASE_URL` or `OPENAI_BASE_URL`

## Start LLMSpy

From any folder:

```bash
npx llmspy
```

This serves the proxy and the UI on `http://127.0.0.1:8080`, in the foreground. Stop it with Ctrl+C, or with `npx llmspy stop` from any terminal.

::: tip In the background
`npx llmspy --background` (`-b`) returns once LLMSpy is ready, and writes its output to `~/.llmspy/llmspy.log`. `npx llmspy stop` stops it. See the [CLI reference](/reference/cli).
:::

## Point an app at it

Set the app's base URL to LLMSpy plus the provider's path prefix:

| Prefix       | Forwards to                 | Example                                              |
| ------------ | --------------------------- | ---------------------------------------------------- |
| `/anthropic` | `https://api.anthropic.com` | `ANTHROPIC_BASE_URL=http://127.0.0.1:8080/anthropic` |
| `/openai`    | `https://api.openai.com`    | `OPENAI_BASE_URL=http://127.0.0.1:8080/openai/v1`    |

For example, to watch Claude Code:

::: code-group

```powershell [PowerShell]
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8080/anthropic"
claude
```

```bash [bash]
ANTHROPIC_BASE_URL=http://127.0.0.1:8080/anthropic claude
```

:::

The app keeps its own API key, which LLMSpy passes on to the provider. Most apps read the variable only when they start, so start the app after setting it.

From code, pass the base URL to the SDK:

::: code-group

```ts [Anthropic SDK]
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ baseURL: 'http://127.0.0.1:8080/anthropic' });
```

```ts [OpenAI SDK]
import OpenAI from 'openai';

const client = new OpenAI({ baseURL: 'http://127.0.0.1:8080/openai/v1' });
```

:::

The OpenAI SDKs expect `/v1` in their base URL; the Anthropic SDK does not.

## Look at a call

Open `http://127.0.0.1:8080`. Each call appears in the list on the left as soon as it is sent. Select one to read it as a conversation, see it raw, or compare it with another call.

![LLMSpy showing a coding agent's call as a conversation: the user's question, the assistant's tool calls and the tool results](/screenshots/conversation.png)

## What's next?

- **Find your way around the UI**: [The call list](/guide/call-list), [Reading a call](/guide/reading-a-call), [Comparing calls](/guide/compare)
- **Watch several apps at once**: [Projects](/guide/projects)
- **Use OpenRouter, Gemini, Ollama or a gateway**: [Upstreams](/guide/upstreams)
- **Run it in Docker**: [Installation](/guide/installation#docker) and [Docker](/guide/docker)
- **Let a coding agent read the calls**: [Reading calls from code](/guide/agents)

If something isn't working, see [Troubleshooting](/troubleshooting).
