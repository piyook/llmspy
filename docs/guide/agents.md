# Reading calls from code

Coding agents and scripts can read what LLMSpy captured from a small API on the same port as the UI: list and search the calls as JSON, read one as Markdown, count tokens, failures and latency, and wait for a running call to end. Use it to let an agent check what an app it is building or debugging really sent and got back, without you copying anything across.

## llms.txt for agents

[`llms.txt`](/llms.txt) is a compact reference written for agents: how to run LLMSpy, point an app at it, read the captured traffic, and wait for a call that is still running. It ships in the npm package, and a running LLMSpy serves it for its own version at `http://127.0.0.1:8080/llms.txt`. Point your agent at that address.

An agent that starts LLMSpy itself should use the background start, which returns once LLMSpy is ready:

```bash
npx --yes llmspy --background
npx --yes llmspy stop
```

`--yes` keeps `npx` from waiting for an answer to "Ok to proceed?" on the first run.

## Recipes

Read the last call as text, the shortest way to see what an agent sent and got back:

```bash
id=$(curl -s 'http://127.0.0.1:8080/api/requests?limit=1' | jq -r '.[0].id')
curl -s "http://127.0.0.1:8080/api/requests/$id/conversation"
```

Find what went wrong, newest first:

```bash
curl -s 'http://127.0.0.1:8080/api/requests?failed=1&limit=10'
curl -s 'http://127.0.0.1:8080/api/requests?status=429'
```

See what an app sends for one task, without clearing anyone's calls: note the time, run the app, then read the calls since then.

```bash
since=$(date +%s%3N)
# ... run the app ...
curl -s "http://127.0.0.1:8080/api/requests?since=$since&full=1"
curl -s "http://127.0.0.1:8080/api/stats?since=$since"
```

The first gives the calls in full (newest first), the second their count, failures, tokens and p50/p95 latency, in all and per model. Add `&project=<name>` when other apps send traffic at the same time.

Wait for a running call to end (up to 120 seconds here):

```bash
curl -s "http://127.0.0.1:8080/api/requests/$id/conversation?wait=120"
```

If the header still says `running`, the wait ran out: ask again.

Every route and parameter is in the [HTTP API reference](/reference/api).

::: warning Captured calls are sensitive
Records hold whole prompts and replies, and the last 4 characters of each masked key. Don't save or commit them.
:::
