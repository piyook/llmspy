# Comparing calls

The **Compare** tab sets the selected call (green) against another (red). By default the other is the previous call to the same upstream, which in an agent loop is the turn before; "Compare with another call" picks any other.

## What changed

The summary sums up what changed between the two calls: model, stop reason, system prompt, tools, messages and tokens. It shows only the messages that are new.

![The Compare tab: the system prompt's one changed line, token counts for both calls, and the two messages the later call added](/screenshots/compare.png)

## Request body diff

Under the summary, a line diff of the two request bodies shows everything else that changed, such as `max_tokens`, `temperature` or a tool's schema, with unchanged stretches folded away.

![The request body diff in the Compare tab, with the messages the later call added in green](/screenshots/compare-body.png)
