<script lang="ts">
import { onMount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import Detail from './Detail.svelte';
import { previousCall } from './lib/compare.js';
import { countSince, DEFAULT_PROJECT, projectNames } from './lib/projects.js';
import { matchesSearch, newestFirst } from './lib/requests.js';
import type { CapturedRequest, Tab } from './lib/types.js';
import ProjectTabs from './ProjectTabs.svelte';
import RequestRow from './RequestRow.svelte';
import Toolbar from './Toolbar.svelte';

/** How long to wait before reopening `/events` after the browser gives up on it. */
const RECONNECT_MS = 3000;

// Keyed by id, so an update to a running call replaces its row.
const requests = new SvelteMap<string, CapturedRequest>();
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

const visible = $derived(
	[...requests.values()]
		.filter(
			(request) =>
				request.project === project && matchesSearch(request, search),
		)
		.sort(newestFirst),
);

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
			const request: CapturedRequest = JSON.parse(event.data);
			requests.set(request.id, request);
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
    {#each visible as request (request.id)}
      <RequestRow
        {request}
        selected={request.id === selectedId}
        {comparing}
        compared={comparing && request.id === other?.id}
        onselect={() => onrowclick(request.id)}
        ondelete={() => deleteRequest(request.id)}
      />
    {:else}
      <div class="no-requests">
        {search
          ? 'No requests match your search'
          : 'No requests captured yet. Point an app at LLMSpy, e.g. ANTHROPIC_BASE_URL=http://127.0.0.1:8080/anthropic'}
      </div>
    {/each}
  </section>

  <section class="detail" aria-label="Selected request">
    {#if selected}
      <Detail
        request={selected}
        {other}
        {picking}
        onpick={() => (picking = !picking)}
        bind:chosen={tab}
      />
    {:else}
      <div class="no-requests">Select a request to see it here.</div>
    {/if}
  </section>
</div>
