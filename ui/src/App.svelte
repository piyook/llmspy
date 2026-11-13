<script lang="ts">
import { onMount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import Detail from './Detail.svelte';
import { matchesSearch, newestFirst } from './lib/requests.js';
import type { CapturedRequest } from './lib/types.js';
import RequestRow from './RequestRow.svelte';
import Toolbar from './Toolbar.svelte';

/** How long to wait before reopening `/events` after the browser gives up on it. */
const RECONNECT_MS = 3000;

// Keyed by id: `/events` replays the whole store on every (re)connect,
// so a request seen again replaces itself instead of being added twice.
const requests = new SvelteMap<string, CapturedRequest>();
let search = $state('');
let selectedId = $state<string>();

// Looked up by id, so the selection stays put as new requests arrive.
const selected = $derived(selectedId ? requests.get(selectedId) : undefined);

const visible = $derived(
	[...requests.values()]
		.filter((request) => matchesSearch(request, search))
		.sort(newestFirst),
);

onMount(() => {
	let events: EventSource | undefined;
	let retry: ReturnType<typeof setTimeout> | undefined;

	function connect() {
		events = new EventSource('/events');
		events.onmessage = (event) => {
			const request: CapturedRequest = JSON.parse(event.data);
			requests.set(request.id, request);
		};
		// EventSource retries a dropped connection by itself. It stops for
		// good (CLOSED) only on an HTTP error, e.g. the Vite dev proxy's 5xx
		// while the proxy restarts, so only then open a new one.
		events.onerror = () => {
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

async function clearRequests() {
	try {
		await fetch('/api/clear', { method: 'POST' });
		requests.clear();
	} catch (err) {
		console.error('Failed to clear requests:', err);
	}
}
</script>

<Toolbar bind:search onclear={clearRequests} />

<div class="panes">
  <section class="list" aria-label="Captured requests">
    {#each visible as request (request.id)}
      <RequestRow
        {request}
        selected={request.id === selectedId}
        onselect={() => (selectedId = request.id)}
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
      <Detail request={selected} />
    {:else}
      <div class="no-requests">Select a request to see it here.</div>
    {/if}
  </section>
</div>
