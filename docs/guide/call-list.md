# The call list

Every call appears in the list on the left as soon as it is sent, newest first, with its status, time taken and token counts. A call still running is marked `waiting` or `replying` with a running timer; its reply shows once it ends.

## Days and recent minutes

The list is grouped by day, with older days folded away. The chips under Today show only the calls from the last 5 to 90 minutes, such as one run of an agent, and the Today heading counts how many are shown.

<img src="/screenshots/days.png" width="300" alt="The call list narrowed to the last 15 minutes: Today shows 3 of 15 calls, with Yesterday and Thu 12 Nov folded below">

Calls are kept for 7 days by default, in a file on your machine; see [Storage](/reference/configuration#storage).

## Failed calls

When a project has calls that went wrong, a red **Failed** chip above the list counts them; press it to see only those, on every day. A call has failed when:

- the upstream could not be reached, or its reply broke off
- its status is 400 or above
- the provider sent an error inside the reply

<img src="/screenshots/failed.png" width="300" alt="The Failed chip pressed: the list shows only the failed calls, two 429s, two errors in the stream and two dropped streams">

Agents get the same calls from `GET /api/requests?failed=1` (see [HTTP API](/reference/api)).

## Search

The search box finds calls whose host, path, request body or response body holds the text, ignoring case. A search looks in every [project](/guide/projects).

## Summary cards

Cards above the panes sum up the calls in the list as it is narrowed (by project, search, the Failed chip and the minutes chips): how many there are and how many are running, how many failed, their tokens in, out and cached, and their p50 and p95 latency. They update live, and agree with `GET /api/stats`.

![The cards above the panes for the general project: 54 calls, 18 failed (33%, in red), 990 tokens in and 996 out, latency p50 16ms and p95 801ms](/screenshots/cards.png)

## Exporting calls

Export saves the calls in the list as you see it (the project you are viewing, narrowed by the search, the Failed chip and a minutes chip) as an [`llm-capture`](/reference/capture-format) file, for other tools or to keep. Calls still running are left out, and so are API keys. The file still holds whole prompts and replies, so review it before you share it.

## Clearing calls

Clear All empties the project you are viewing, from the file on disk too, and the delete button on a call removes that one. A call still running when you press Clear All shows up again when it ends.
