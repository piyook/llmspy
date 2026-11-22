# Apps without a base URL

LLMSpy only sees apps that let you set their base URL. For one that doesn't, an intercepting proxy such as [mitmproxy](https://mitmproxy.org) can catch its calls and hand them to LLMSpy, so you still get LLMSpy's views.

A small mitmproxy add-on is enough as a starting point:

```python
# llmspy.py: send intercepted LLM API calls on to LLMSpy
from mitmproxy import http

LLMSPY = "http://127.0.0.1:8080"
ROUTES = {
    "api.anthropic.com": "anthropic",
    "api.openai.com": "openai",
}


def request(flow: http.HTTPFlow) -> None:
    name = ROUTES.get(flow.request.pretty_host)
    if name:
        flow.request.url = f"{LLMSPY}/{name}{flow.request.path}"
```

Run it on another port, as mitmproxy also defaults to 8080:

```bash
mitmdump --listen-port 8081 -s llmspy.py
```

Then start the app with `HTTPS_PROXY=http://127.0.0.1:8081` and with mitmproxy's CA certificate trusted (see mitmproxy's docs on certificates). Calls to other hosts pass through mitmproxy untouched. Put `@<project>/` before the name in the URL to give the app its own [project](/guide/projects). Don't set `HTTPS_PROXY` for LLMSpy itself.

::: danger Trust the CA in one app only
mitmproxy's CA can stand in for any web site, so trust it only in the app you are watching (for Node, `NODE_EXTRA_CA_CERTS`), not in your system's certificate store. Only intercept apps on your own machine, or with the informed consent of whoever uses them.
:::
