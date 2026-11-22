# Troubleshooting

**The app still calls the provider directly**

Check that it reads the base URL variable you set, and that it was started after you set it. Most apps read it only at startup.

**404 from LLMSpy**

The path prefix doesn't match an upstream; the response lists the known ones. Check the app's base URL against [Upstreams](/guide/upstreams), and that a [project](/guide/projects) name is lowercase letters, digits and dashes.

**The app reports a connection error and nothing appears in LLMSpy**

The app can't reach LLMSpy. Check that LLMSpy is running; if the app runs in a container, `localhost` is that container (see [localhost in a container](/guide/docker#localhost-in-a-container)).

**The magnifying glass in the logo is red**

The page has lost its connection to LLMSpy, usually because LLMSpy was stopped. Start it again; the page reconnects by itself and the glass turns green.

**502 from LLMSpy**

The upstream could not be reached; the call in the UI shows the error. A refused connection usually means a local upstream that is not started, or the wrong port. With Docker, an upstream on your machine or in another container is not at `localhost` (see [localhost in a container](/guide/docker#localhost-in-a-container)).

**LLMSpy won't start: `EADDRINUSE`, or Docker's "port is already allocated"**

Something else has port 8080, often LLMSpy started another way. Stop it with `llmspy stop` (or `npm run stop`), or `npm run stop:docker`.

**`llmspy --background` exits with an error**

It prints the end of the log. The whole of it is in `~/.llmspy/llmspy.log.new`.

**403 from the API**

The API only answers requests addressed to `localhost`, `127.0.0.1` or `[::1]`. A call from another container (`Host: host.docker.internal`) is refused on purpose. See [HTTP API](/reference/api).
