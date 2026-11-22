# Configuration

LLMSpy has no config file and no flags for its settings. It reads these environment variables when it starts:

| Variable                | Default     | Meaning                                                       |
| ----------------------- | ----------- | ------------------------------------------------------------- |
| `PROXY_PORT`            | `8080`      | Port for the proxy and the UI                                 |
| `LLMSPY_HOST`           | `127.0.0.1` | Interface to listen on; the Docker image sets `0.0.0.0`       |
| `LLMSPY_UPSTREAMS`      |             | Extra or replacement upstreams, see [Upstreams](/guide/upstreams) |
| `LLMSPY_RETENTION_DAYS` | `7`         | Days to keep captured calls; `0` keeps them until cleared     |

A bad `LLMSPY_UPSTREAMS` or `LLMSPY_RETENTION_DAYS` stops LLMSpy at startup, with the reason.

## Where settings are read from

Settings come from the shell, and from a `.env` file. The shell wins over the file.

| How you run it      | File                                                   |
| ------------------- | ------------------------------------------------------ |
| `llmspy` (npm)      | `~/.llmspy/.env`                                       |
| `npm start`, `npm run dev` | `.env` at the root of the repo                  |
| Docker              | `.env` next to `compose.yaml` (only `LLMSPY_UPSTREAMS` and `LLMSPY_RETENTION_DAYS` are passed in) |

Files are read at start: restart LLMSpy (or rerun `npm run start:docker`) after changing one. See [Setting upstreams for a local run](/guide/upstreams#setting-upstreams-for-a-local-run) and [Setting upstreams in Docker](/guide/docker#setting-upstreams-in-docker).

## Storage

Captured calls are kept in `~/.llmspy/llmspy.db` (with Docker, in the `llmspy-data` volume), so they are still there after a restart. LLMSpy prints where, and for how long, when it starts.

- Calls older than `LLMSPY_RETENTION_DAYS` are removed at startup and every hour after.
- Clear All and the delete button remove calls from the file too.
- A call still running when LLMSpy stopped is shown as interrupted.

The file holds whole prompts and replies (API keys are masked), so treat it like the traffic itself: it stays on your machine, and deleting it while LLMSpy is stopped removes every call.

## Files in ~/.llmspy

| File                  | What it is                                         |
| --------------------- | -------------------------------------------------- |
| `llmspy.db`           | The captured calls                                 |
| `.env`                | Your settings for the `llmspy` command, if you add it |
| `llmspy.pid`          | The running LLMSpy, for `llmspy stop`              |
| `llmspy.log`          | Output of `llmspy --background`                    |
