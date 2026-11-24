---
layout: home

hero:
  name: LLMSpy
  text: See what your LLM apps really send
  tagline: A small local proxy that shows every call to Anthropic, OpenAI and others live, as a conversation. One command to start, one base URL to set.
  image:
    src: /logo.svg
    alt: LLMSpy
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Installation
      link: /guide/installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/piyook/llmspy

features:
  - icon: ⚡
    title: Live capture
    details: Every call shows up as soon as it is sent and is filled in when the reply ends. Streamed replies still stream to the app.
    link: /guide/call-list
    linkText: The call list
  - icon: 💬
    title: Conversation view
    details: The system prompt, tools and messages, tool calls matched to their results, and the reply with its stop reason and token use.
    link: /guide/reading-a-call
    linkText: Reading a call
  - icon: 🔍
    title: Compare calls
    details: Diff a call against the one before it, or any other, to see what an agent changed between turns.
    link: /guide/compare
    linkText: Comparing calls
  - icon: 🔌
    title: Any compatible API
    details: Anthropic and OpenAI are built in. Add OpenRouter, Gemini, Ollama, a gateway or a mock with one setting.
    link: /guide/upstreams
    linkText: Upstreams
  - icon: 🤖
    title: Agent friendly
    details: Coding agents and scripts list, search and read the captured calls as JSON or Markdown, and wait for a running call to end.
    link: /guide/agents
    linkText: Reading calls from code
  - icon: 🪶
    title: Lightweight
    details: No certificates, accounts, API keys or config file. The npm package installs nothing else, and calls stay in one file on your machine.
    link: /reference/how-it-works
    linkText: How it works
---

## Try it

With Node.js 26 or later:

```bash
npx llmspy
```

Then point an app at it and open `http://127.0.0.1:8080`:

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8080/anthropic claude
```

[Getting started](/guide/getting-started) walks you through it.

<DemoVideo />

::: tip Using a coding agent?
Point it at [`llms.txt`](/llms.txt) (also shipped in the npm package, and served by a running LLMSpy at `http://127.0.0.1:8080/llms.txt`): how to run LLMSpy, point an app at it, and read what was captured.
:::
