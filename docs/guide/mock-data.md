# Testing with mock data

To try LLMSpy without an API key or network, a clone of the repo has two [llmock](https://llmock.piyook.com/) servers set up, with their config in `mock/.llmockrc.json`: the Anthropic Messages API on `http://127.0.0.1:8001` and OpenAI Chat Completions on `http://127.0.0.1:8002`. They reply with generated text. They need `npm install` first, even if you run LLMSpy in Docker.

The screenshots in these docs are of this made-up traffic.

## Run it

Start the mocks in one terminal and leave them running:

```bash
npm run mock
```

In a second terminal, start LLMSpy with the mocks as upstreams (after `npm run build`):

```bash
LLMSPY_UPSTREAMS=llmock=http://127.0.0.1:8001,llmock-openai=http://127.0.0.1:8002 npm start
```

With Docker, put `LLMSPY_UPSTREAMS=llmock=http://host.docker.internal:8001,llmock-openai=http://host.docker.internal:8002` in `.env` and run `npm run start:docker` instead.

Then, in a third terminal, send the sample calls:

```bash
node scripts/mock-traffic.mjs
```

## Picking a reply

The script sends one call of each kind below. To use the mocks from your own client, set its base URL to `http://127.0.0.1:8080/llmock` (Anthropic) or `http://127.0.0.1:8080/llmock-openai/v1` (OpenAI), with any non-empty key. A marker in the last message picks the reply:

| Marker          | Reply                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| `#tools`        | A `get_weather` tool call (Anthropic); a tool result containing `sunny` gets the final answer |
| `#max-tokens`   | A reply cut off at the token limit                                                            |
| `#refusal`      | A refusal                                                                                     |
| `#rate-limit`   | HTTP 429                                                                                      |
| `#stream-error` | A stream that sends an error event part-way through                                           |
| `#stream-drop`  | A stream whose connection is cut part-way through                                             |

Anything else gets random lorem ipsum. Both mocks stream when the request sets `"stream": true`.
