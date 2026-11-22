# Capture format

An `llm-capture` file holds captured LLM API calls in a documented JSON shape, so that other tools can use them without knowing how LLMSpy works inside: a mock server could replay them, a test suite could check them, a script could re-send them to another model. LLMSpy writes it; this page is the contract for anything that reads it.

This is version 1.

## Exporting from LLMSpy

In the UI, **Export** saves the calls in the list as you see it: the project you are viewing, narrowed by the search, the Failed chip and a minutes chip. The file is named `llmspy-<project>-<YYYYMMDD-HHmm>.capture.json`.

From a script, `GET /api/export` takes the same filters as `GET /api/requests` (see the [HTTP API](/reference/api#filters)), except `limit` and `full`:

```bash
curl -s 'http://127.0.0.1:8080/api/export?project=my-app&failed=1' -o failed.capture.json
```

Calls still running are left out. Export what you need rather than everything: an agent re-sends its whole conversation on every call, so a long agent session can come to 100 MB or more.

::: warning Captures are sensitive
A capture holds whole prompts and replies. Credential headers are left out, but nothing else is redacted: review a file before you share or commit it.
:::

## The file

One JSON document in UTF-8. LLMSpy writes it indented, so a capture can be read and diffed.

```json
{
  "format": "llm-capture",
  "version": 1,
  "createdAt": "2026-11-22T14:03:11.204Z",
  "createdBy": "llmspy 0.8.0",
  "calls": []
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `format` | `"llm-capture"` | yes | Identifies the file. A reader rejects anything else. |
| `version` | integer | yes | `1`. A reader rejects a version it does not know. |
| `createdAt` | ISO 8601 string | yes | When the file was written. |
| `createdBy` | string | no | The tool and version that wrote it. Informational only. |
| `calls` | call[] | yes | Oldest first, the order the calls were made. |

New optional fields can appear in version 1, so a reader ignores fields it does not know. A field that changes meaning or is removed means a new version.

## A call

Each call has two layers. `http` is the exchange as it was sent and received: the source of truth, and what a tool needs to replay or re-send it. `llm` is the same exchange read into one shape for every provider: what most readers use. `llm` is derived from `http`, and is absent when the call was not to an API LLMSpy can read.

```json
{
  "id": "0b7e6a52-4f0e-4d43-9a57-3c1f2e8d9b10",
  "timestamp": "2026-11-22T14:01:02.511Z",
  "project": "my-app",
  "upstream": "anthropic",
  "http": {
    "request": {
      "method": "POST",
      "url": "https://api.anthropic.com/v1/messages",
      "headers": {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      "body": "{\"model\":\"claude-sonnet-5-5\",\"max_tokens\":1024,\"stream\":true,...}"
    },
    "response": {
      "status": 200,
      "headers": { "content-type": "text/event-stream" },
      "body": "event: message_start\ndata: {...}\n\n..."
    },
    "timings": { "start": 1795437662511, "firstByte": 1795437663012, "end": 1795437665840 }
  },
  "llm": {
    "format": "anthropic-messages",
    "model": "claude-sonnet-5-5",
    "stream": true,
    "system": "You are a helpful assistant.",
    "messages": [
      { "role": "user", "parts": [{ "type": "text", "text": "What's the weather in Paris?" }] }
    ],
    "tools": [
      {
        "name": "get_weather",
        "description": "Current weather for a city",
        "inputSchema": {
          "type": "object",
          "properties": { "city": { "type": "string" } }
        }
      }
    ],
    "output": {
      "role": "assistant",
      "parts": [
        { "type": "text", "text": "Let me check." },
        { "type": "tool_call", "id": "toolu_01", "name": "get_weather", "input": { "city": "Paris" } }
      ]
    },
    "stopReason": "tool_use",
    "usage": { "input": 412, "output": 38 }
  }
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique within the file. |
| `timestamp` | ISO 8601 string | yes | When the request was made. |
| `project` | string | no | A grouping label. LLMSpy: the [project](/guide/projects), `general` by default. |
| `upstream` | string | no | The writer's name for where the call went. LLMSpy: the path prefix, such as `anthropic`. |
| `http` | object | yes | The exchange as sent and received. |
| `llm` | object | no | The exchange read as an LLM API call. |

### `http`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `request.method` | string | yes | |
| `request.url` | string | yes | The full upstream URL, with its query. |
| `request.headers` | object | yes | Header name (lower case) to a string or an array of strings. Credentials and transport headers are left out (below). |
| `request.body` | string | yes | Decompressed, decoded as UTF-8. `""` when there was none. |
| `response` | object | no | Absent when no response arrived, such as a refused connection. |
| `response.status` | integer | yes | |
| `response.headers` | object | yes | As for the request. |
| `response.body` | string | yes | Decompressed, UTF-8. A streamed reply is the event-stream text as it was received, so it can be replayed event by event. |
| `timings` | object | yes | Epoch milliseconds: `start` (required), `firstByte` when the response headers arrived, `end` when the exchange finished. |
| `error` | string | no | Why the exchange failed, at the transport level (not an API error reply, which is in `response`). Absent when it did not fail. |

Headers left out:

- **Credentials**, entirely rather than masked: `authorization`, `x-api-key`, `proxy-authorization`, `cookie`, `set-cookie`, and any header whose name contains `key`, `token` or `secret`.
- **Transport**: `host`, `content-length` and `content-encoding`, since the bodies are stored decompressed.

### `llm`

| Field | Type | Meaning |
|---|---|---|
| `format` | string | `anthropic-messages`, `openai-chat` or `openai-responses`. More may be added in version 1: a reader skips the `llm` of a format it does not know, and still has `http`. |
| `model` | string | The model asked for, or the one that answered when the reply names it. |
| `stream` | boolean | Whether the reply was streamed. |
| `system` | string | The system prompt or instructions. |
| `messages` | message[] | The conversation sent, oldest first. |
| `tools` | tool[] | The tools offered: `name`, `description`, and `inputSchema` (the JSON Schema of the tool's input, as sent; built-in tools have none). |
| `output` | message | The reply, reassembled when it was streamed. |
| `stopReason` | string | The provider's own value (`end_turn`, `tool_use`, `stop`, `length`, ...), not normalised. |
| `usage` | object | Token counts as the provider reports them: `input`, `output`, `cacheRead`, `cacheWrite`, `reasoning`. They are not comparable across formats: Anthropic's `input` leaves out cached tokens, OpenAI's includes them. |
| `error` | object | `{type?, message}`: an error the provider reported inside a successful reply, such as an error event part-way through a stream. |
| `parseError` | string | Set when a body could not be read; the rest of `llm` holds what could be. |

Every field but `format`, `stream` and `messages` is optional.

A message is `{role, parts}`, with `role` one of `user`, `assistant` or `tool`. A part is one of:

| Part | Fields |
|---|---|
| `text` | `text` |
| `thinking` | `text` |
| `tool_call` | `id`, `name`, `input` |
| `tool_result` | `id`, `content`, `isError` (optional) |
| `image` | none: the image data is left out here, and is still in `http` |
| `other` | `raw`: a block with no view of its own, as it was sent |
