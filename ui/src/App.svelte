<script lang="ts">
import { onMount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import DayHeader from './DayHeader.svelte';
import Detail from './Detail.svelte';
import { previousCall } from './lib/compare.js';
import { dayKey, dayLabel, groupByDay } from './lib/days.js';
import { countSince, DEFAULT_PROJECT, projectNames } from './lib/projects.js';
import { fullRecord } from './lib/record.svelte.js';
import { callState, newestFirst } from './lib/requests.js';
import type { CallSummary, Tab } from './lib/types.js';
import ProjectTabs from './ProjectTabs.svelte';
import RequestRow from './RequestRow.svelte';
import Toolbar from './Toolbar.svelte';

/** How long to wait before reopening `/events` after the browser gives up on it. */
const RECONNECT_MS = 3000;
/** How long typing must pause before the proxy is asked for the search. */
const SEARCH_DELAY_MS = 250;

// The summary of each call, from `/events`. Keyed by id, so an update to a
// running call replaces its row.
const requests = new SvelteMap<string, CallSummary>();
let search = $state('');
let selectedId = $state<string>();
// Whether `/events` is open: it is served by the proxy that forwards
// traffic, so this is also whether LLMSpy is listening.
let connected = $state(false);
// Where the proxy listens, e.g. `127.0.0.1:8080`, shown in the status tooltip.
let address = $state<string>();

async function loadAddress() {
	try {
		const { port } = await (await fetch('/ping')).json();
		if (typeof port === 'number') address = `${location.hostname}:${port}`;
	} catch {
		// Only a tooltip detail: without it the icon just says "Listening".
	}
}

const projects = $derived(projectNames(requests.values()));
let chosenProject = $state(DEFAULT_PROJECT);
// A project's tab goes once its last call is deleted or cleared.
const project = $derived(
	projects.includes(chosenProject) ? chosenProject : DEFAULT_PROJECT,
);
// When each project was last viewed, for the count of new calls on its tab.
// Calls from before the page opened are not new.
const openedAt = Date.now();
const lastViewed = new SvelteMap<string, number>();
const unseen = (name: string) =>
	countSince(requests.values(), name, lastViewed.get(name) ?? openedAt);

function chooseProject(name: string) {
	if (name === project) return;
	const now = Date.now();
	lastViewed.set(project, now);
	lastViewed.set(name, now);
	chosenProject = name;
	selectedId = undefined;
	pickedId = undefined;
	picking = false;
}

// Looked up by id, so the selection stays put as new requests arrive.
const selected = $derived(selectedId ? requests.get(selectedId) : undefined);
// The detail pane shows the full record, fetched again as the call runs.
const selectedRecord = fullRecord(() => selected);

let tab = $state<Tab>('conversation');
// The call the Compare tab compares the selected one with: the one picked
// in the list, or else the previous call to the same upstream.
let pickedId = $state<string>();
// Whether the next click in the list picks that call instead of selecting.
let picking = $state(false);
const other = $derived.by(() => {
	if (!selected) return undefined;
	const picked = pickedId ? requests.get(pickedId) : undefined;
	return picked ?? previousCall(requests.values(), selected);
});
const comparing = $derived(selected !== undefined && tab === 'compare');
// Only the Compare tab needs the other call's body.
const otherRecord = fullRecord(() => (comparing ? other : undefined));
// Whether the pane is waiting for a record, rather than showing an older one.
const loading = $derived(
	!selectedRecord.current ||
		(comparing && other !== undefined && !otherRecord.current),
);

function onrowclick(id: string) {
	if (picking) {
		picking = false;
		if (id !== selectedId) pickedId = id;
		return;
	}
	selectedId = id;
	pickedId = undefined;
}

function onkeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') picking = false;
}

// The ids of the calls in the project shown that match `search`, from the
// proxy, which holds the bodies; undefined until the first answer.
let matches = $state.raw<Set<string>>();
// The search is run again when a call ends, since its reply may match.
const finished = $derived(
	[...requests.values()].filter(
		(call) => call.project === project && callState(call) === 'done',
	).length,
);
$effect(() => {
	const term = search;
	const name = project;
	void finished;
	if (!term) {
		matches = undefined;
		return;
	}
	let stale = false;
	const timer = setTimeout(async () => {
		try {
			const query = new URLSearchParams({ project: name, q: term });
			const res = await fetch(`/api/requests?${query}`);
			if (!res.ok) return;
			const found: CallSummary[] = await res.json();
			if (!stale) matches = new Set(found.map(({ id }) => id));
		} catch (err) {
			console.error('Failed to search requests:', err);
		}
	}, SEARCH_DELAY_MS);
	return () => {
		stale = true;
		clearTimeout(timer);
	};
});

const visible = $derived(
	[...requests.values()]
		.filter(
			(call) =>
				call.project === project &&
				(!search || !matches || matches.has(call.id)),
		)
		.sort(newestFirst),
);

/** How often the day labels are brought up to date. */
const CLOCK_MS = 60_000;
// For the labels, so Today becomes Yesterday at midnight.
let now = $state(Date.now());
const today = $derived(dayKey(now));
// Days opened or closed by hand; any other day is open only if it is today.
const dayOpen = new SvelteMap<string, boolean>();
$effect(() => {
	const timer = setInterval(() => {
		const next = Date.now();
		// A day left at its default stays open after midnight.
		const before = dayKey(now);
		if (dayKey(next) !== before && !dayOpen.has(before)) {
			dayOpen.set(before, true);
		}
		now = next;
	}, CLOCK_MS);
	return () => clearInterval(timer);
});
const groups = $derived(groupByDay(visible));
// While searching, every day with a match is open.
const isOpen = (key: string) =>
	Boolean(search) || (dayOpen.get(key) ?? key === today);

onMount(() => {
	let events: EventSource | undefined;
	let retry: ReturnType<typeof setTimeout> | undefined;

	function connect() {
		events = new EventSource('/events');
		events.onopen = () => {
			connected = true;
			// `/events` replays the whole store after this, so start empty:
			// rows from before a proxy restart would otherwise stay forever.
			requests.clear();
			// Again on every reconnect: a restarted proxy may use another port.
			loadAddress();
		};
		events.onmessage = (event) => {
			const call: CallSummary = JSON.parse(event.data);
			requests.set(call.id, call);
		};
		// Clear All in any tab, or a `POST /api/clear` from elsewhere: of one
		// project, or of every project when none is named.
		events.addEventListener('clear', (event) => {
			const { project } = JSON.parse(event.data);
			clearProject(typeof project === 'string' ? project : undefined);
		});
		// One call deleted, in any tab.
		events.addEventListener('delete', (event) => {
			const { id } = JSON.parse(event.data);
			if (typeof id === 'string') removeRequest(id);
		});
		// EventSource retries a dropped connection by itself. It stops for
		// good (CLOSED) only on an HTTP error, e.g. the Vite dev proxy's 5xx
		// while the proxy restarts, so only then open a new one.
		events.onerror = () => {
			connected = false;
			if (events?.readyState === EventSource.CLOSED) {
				retry = setTimeout(connect, RECONNECT_MS);
			}
		};
	}

	connect();
	return () => {
		clearTimeout(retry);
		events?.close();
	};
});

function removeRequest(id: string) {
	requests.delete(id);
	if (selectedId === id) {
		selectedId = undefined;
		picking = false;
	}
	if (pickedId === id) pickedId = undefined;
}

async function deleteRequest(id: string) {
	try {
		const res = await fetch(`/api/requests/${id}`, { method: 'DELETE' });
		// 404: already gone, e.g. deleted in another tab.
		if (res.ok || res.status === 404) removeRequest(id);
	} catch (err) {
		console.error('Failed to delete request:', err);
	}
}

/** Drops the calls of `name`, or every call when it is undefined. */
function clearProject(name?: string) {
	for (const request of [...requests.values()]) {
		if (name === undefined || request.project === name) {
			removeRequest(request.id);
		}
	}
}

/** Clear All: the project being viewed only. */
async function clearRequests() {
	const name = project;
	try {
		await fetch(`/api/clear?project=${encodeURIComponent(name)}`, {
			method: 'POST',
		});
		clearProject(name);
	} catch (err) {
		console.error('Failed to clear requests:', err);
	}
}
</script>

<svelte:window {onkeydown} />

<Toolbar bind:search {connected} {address} onclear={clearRequests} />
<ProjectTabs {projects} current={project} {unseen} onchoose={chooseProject} />

<div class="panes">
  <section class="list" class:picking aria-label="Captured requests">
    {#if picking}
      <p class="pick-hint" role="status">
        Click the call to compare with.
        <button type="button" class="small-btn" onclick={() => (picking = false)}>Cancel</button>
      </p>
    {/if}
    {#each groups as group (group.key)}
      {@const open = isOpen(group.key)}
      <div class="day">
        <DayHeader
          label={dayLabel(group.key, now)}
          count={group.calls.length}
          {open}
          ontoggle={() => dayOpen.set(group.key, !open)}
        />
        {#if open}
          {#each group.calls as request (request.id)}
            <RequestRow
              {request}
              selected={request.id === selectedId}
              {comparing}
              compared={comparing && request.id === other?.id}
              onselect={() => onrowclick(request.id)}
              ondelete={() => deleteRequest(request.id)}
            />
          {/each}
        {/if}
      </div>
    {:else}
      <div class="no-requests">
        {search
          ? 'No requests match your search'
          : 'No requests captured yet. Point an app at LLMSpy, e.g. ANTHROPIC_BASE_URL=http://127.0.0.1:8080/anthropic'}
      </div>
    {/each}
  </section>

  <section class="detail" aria-label="Selected request">
    {#if selected && loading}
      <div class="no-requests">Loading…</div>
    {:else if selectedRecord.current}
      <Detail
        request={selectedRecord.current}
        other={otherRecord.current}
        {picking}
        onpick={() => (picking = !picking)}
        bind:chosen={tab}
      />
    {:else}
      <div class="no-requests">Select a request to see it here.</div>
    {/if}
  </section>
</div>
