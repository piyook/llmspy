# How it works

LLMSpy is one Node.js HTTP server, on one port, that does three things:

- **Forwarding.** `/<prefix>/...` (or `/@<project>/<prefix>/...`) is forwarded to the upstream with the bytes unchanged, chunk by chunk, so streamed replies still stream to the app. A copy of each body is kept as it passes, decompressed (gzip, deflate, br, zstd) and decoded for display. LLMSpy never changes a request or a response.
- **The API.** `/api/*`, `/events` and `/ping` serve the captured calls to the UI and to agents (see [HTTP API](/reference/api)).
- **The UI.** Any other path is a file from the built UI, a Svelte app.

## Recording a call

A call is recorded as soon as its request body has arrived, updated when the response headers arrive, and completed when the exchange ends: when the response has been sent in full, the upstream failed, or the client hung up. A streamed reply is also updated at most every 500 ms with what has arrived so far, so the UI shows it as it streams.

Calls are stored with the SQLite built into Node (`node:sqlite`). A running call is held in memory and written when it starts, when its response headers arrive and when it ends.

## Small on purpose

- One command starts it, and one environment variable points an app at it.
- No certificates to install, no accounts, no API keys of its own and no config file.
- The proxy has no runtime dependencies beyond Node.js, and the UI's two libraries (Svelte and jsdiff) are built into its static files. The npm package installs nothing else.

It does not intercept traffic: there is no MITM mode and no CA certificate. For apps without a base-URL setting, see [Apps without a base URL](/guide/without-base-url).
