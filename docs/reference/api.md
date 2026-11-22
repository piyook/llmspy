# HTTP API

The UI, agents and scripts read the captured calls from a small API on the same port as the proxy, `http://127.0.0.1:8080` by default. It answers only requests addressed to `localhost`, `127.0.0.1` or `[::1]`, and with an `Origin` header only from the same origin, so other web sites open in your browser can't read it; anything else gets `403`. curl, scripts and SDKs send no `Origin` and pass.

[`llms.txt`](/llms.txt) has every field, error and edge case, written for agents. This page is the overview.

## Routes

| Route                                  | Returns                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `GET /ping`                            | `{"status","version","port","pid",…}`: LLMSpy is running               |
| `GET /api/requests`                    | The summary of every call, newest first (filters below)                 |
| `GET /api/stats`                       | Calls, failures, tokens and latency over the same filters, per model and project |
| `GET /api/requests/<id>`               | One call's full record                                                  |
| `GET /api/requests/<id>/conversation`  | One call as Markdown, as you would read it                              |
| `DELETE /api/requests/<id>`            | Delete one call                                                         |
| `POST /api/clear`                      | Clear All; `?project=<name>` clears only that project                   |
| `GET /api/upstreams`                   | Each prefix and where it forwards to                                    |
| `GET /events`                          | Server-Sent Events: every stored summary on connect, then each new or updated call |
| `GET /llms.txt`                        | The agent reference, for the running version                           |

## Filters

`GET /api/requests` and `GET /api/stats` take these, and keep the calls that match all of them:

| Parameter          | Keeps                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| `project=<name>`   | That project's calls                                                     |
| `q=<text>`         | Calls whose host, path, request body or response body holds the text, ignoring case |
| `since=<time>`     | Calls started at or after an ISO time (`2026-11-15T10:00:00Z`) or epoch milliseconds |
| `model=<text>`     | Calls whose model holds the text, ignoring case (`model=sonnet`)         |
| `status=<code>`    | Calls with that status (`429`) or in that class (`5xx`)                  |
| `failed=1`         | Failed calls: an error, a status of 400 or above, or an error in the reply |
| `limit=<n>`        | Only the newest `n` (`/api/requests` only)                               |
| `full=1`           | Full records instead of summaries (`/api/requests` only)                 |

A value that can't be read gets `400` with a message. There is no paging: narrow with `since`, `project` and `limit`. A record can be large (a coding agent's request is often around 1 MB), so use `full=1` with `since` or `limit`, not on its own.

## Waiting for a call

Both reads of one call take `?wait=<seconds>` (1 to 300). While the call is running, the answer comes when it ends, or when the time runs out with the call so far. An ended call is answered at once.

## Records

A summary has the call's `id`, `timestamp`, `project`, `provider`, `host`, `method`, `path`, `timings`, `latency` and `error`, its response status, and its model, token use and provider error. It has no headers or bodies.

A full record adds the request headers and body, the response headers and body, and `llm`: the call read as an LLM API call, with the same shape for every format (model, system prompt, tools, messages as parts, the reply, stop reason and token use). A call still running has no `timings.end`.
