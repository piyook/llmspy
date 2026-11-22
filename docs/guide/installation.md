# Installation

There are three ways to run LLMSpy: the npm package, Docker, or a clone of the repo. They all use port 8080, so use one at a time.

## npm package

With **Node.js 26 or later**, from any folder:

```bash
npx llmspy
```

To keep the `llmspy` command to hand, install it once:

```bash
npm install -g llmspy
llmspy --help
```

`npx` runs the version it has cached, and `npx llmspy@latest` the newest. The package has no dependencies, so it installs nothing else. See the [CLI reference](/reference/cli) for its commands.

## Docker

From a clone of the repo:

```bash
npm run start:docker
```

LLMSpy then runs in the background, restarts with Docker, and serves the same proxy and UI on `http://127.0.0.1:8080`. `npm run stop:docker` stops it. Captured calls are kept in the `llmspy-data` volume, so they are there again at the next start.

Upstreams, and apps that run in containers, need a little more thought with Docker: see [Docker](/guide/docker).

## From source

In a clone of the repo, with Node.js 26 or later:

```bash
npm install
npm run build
npm start
```

Stop it with Ctrl+C, or with `npm run stop` from any terminal. Run `npm run build` again after each update.

## Network exposure

Whichever way you run it, the port is open on the loopback interface only, so nothing outside your machine can reach it. Captured traffic (`/api/*`, `/events`, `/ping`) is only served to requests addressed to `localhost`, `127.0.0.1` or `[::1]`, and not to other web sites open in your browser.

LLMSpy is for local development only. It is not authenticated: don't set `LLMSPY_HOST` to `0.0.0.0` outside Docker, or publish the Docker port as anything but `127.0.0.1:8080:8080`.
