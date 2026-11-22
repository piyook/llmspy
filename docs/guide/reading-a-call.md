# Reading a call

Select a call in the list to look at it in three ways: **Conversation**, **Raw** and [**Compare**](/guide/compare).

## Conversation

Conversation reads the call as the model sees it:

- the system prompt and the tools
- each message by role, with tool calls matched to their results
- the reply at the end, with its stop reason and token use

Streamed replies are put back together. While a streamed reply is still arriving, the view shows what has arrived so far.

![LLMSpy showing a coding agent's call as a conversation: the user's question, the assistant's tool calls and the tool results](/screenshots/conversation.png)

LLMSpy reads three formats, streamed or not, whatever the upstream is called:

| Format                  | Request path ends in |
| ----------------------- | -------------------- |
| Anthropic Messages      | `/v1/messages`       |
| OpenAI Chat Completions | `/chat/completions`  |
| OpenAI Responses        | `/responses`         |

Calls to other APIs are still captured, and shown in Raw.

## Raw

Raw shows the request and response exactly as they went over the wire: method and URL, headers and both bodies. Compressed bodies are decoded for display.

![The Raw tab: request headers with the API key masked, and the request body as JSON](/screenshots/raw.png)

API keys are masked in what LLMSpy records: the `authorization` and `x-api-key` headers keep their scheme and last 4 characters (`Bearer ••••abcd`). Prompts, replies and every other header are recorded as sent.
