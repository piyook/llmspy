# Docker

From a clone of the repo, `npm run start:docker` builds the image and starts LLMSpy in the background, on `http://127.0.0.1:8080`; `npm run stop:docker` stops it. See [Installation](/guide/installation#docker).

| Command                  | What it does                                                                   |
| ------------------------ | ------------------------------------------------------------------------------ |
| `npm run start:docker`   | Build the image and start LLMSpy in Docker, in the background                  |
| `npm run stop:docker`    | Stop and remove the container; captured calls stay in the `llmspy-data` volume |
| `docker compose logs -f` | Follow the container's output: its upstreams, storage and errors               |
| `docker compose down -v` | Stop the container and delete its captured calls                               |

## Setting upstreams in Docker

Put the variable in a `.env` file next to `compose.yaml` (copy `.env.example` to start). Compose reads it and passes `LLMSPY_UPSTREAMS` and `LLMSPY_RETENTION_DAYS`, and nothing else from it, into the container:

```bash
# .env
LLMSPY_UPSTREAMS=openrouter=https://openrouter.ai/api/v1,ollama=http://host.docker.internal:11434
```

Then run `npm run start:docker`, which recreates the container if the value has changed.

## localhost in a container

Inside the container, `localhost` is the container itself, so an upstream running on your machine, such as Ollama or the [mocks](/guide/mock-data), is at `host.docker.internal`. External URLs are the same as for a local run.

The same goes for an app that runs in a container: its `localhost` is its own container, so point it at `http://host.docker.internal:8080/<name>`. An app running directly on your machine uses `http://127.0.0.1:8080/<name>`. If the upstream also runs in a container (a mock server, say), LLMSpy reaches it at `http://host.docker.internal:<published port>`.

::: info Linux
This works as it is with Docker Desktop. On Linux, `host.docker.internal` doesn't reach a port bound only to `127.0.0.1`, which includes LLMSpy's own port and Ollama's default. Put the containers on one Docker network instead, and address them by container name: `http://llmspy:8080/<name>` from the app, and the upstream's name and its container port in `LLMSPY_UPSTREAMS`.
:::

## One .env for local runs and Docker

The repo's `.env` serves both `npm start` and Docker, except for upstreams on your machine: a local run reaches them at `localhost`, Docker at `host.docker.internal`. If you switch between the two, override the variable in the shell for local runs. The `llmspy` command never reads this file, only `~/.llmspy/.env`.
