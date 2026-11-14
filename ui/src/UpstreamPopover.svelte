<script lang="ts">
import Popover from './Popover.svelte';

interface Upstream {
	name: string;
	target: string;
}

/** How long a Copy button says "Copied" (or "Failed") before going back. */
const COPIED_MS = 1500;

let { address }: { address?: string } = $props();

let upstreams = $state<Upstream[]>();
let loadFailed = $state(false);
// Which row's copy button is showing feedback, and what it says.
let copied = $state<{ name: string; label: string }>();
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

// The prefix URL an app points at. Built here, not by the proxy, because only
// the browser knows the address it reaches the proxy on (e.g. from Docker).
function baseUrl(name: string): string {
	return `${location.protocol}//${address}/${name}`;
}

// Fetched on every open: the proxy may have restarted with other upstreams.
async function load() {
	loadFailed = false;
	try {
		const res = await fetch('/api/upstreams');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		upstreams = await res.json();
	} catch {
		upstreams = undefined;
		loadFailed = true;
	}
}

async function copy(name: string) {
	let label = 'Copied';
	try {
		await navigator.clipboard.writeText(baseUrl(name));
	} catch {
		label = 'Failed';
	}
	copied = { name, label };
	clearTimeout(copiedTimer);
	copiedTimer = setTimeout(() => (copied = undefined), COPIED_MS);
}
</script>

<Popover id="upstream-popover" label="Base URLs" onopen={load}>
  {#snippet trigger()}Base URLs{/snippet}

  <p class="popover-hint">Point an app's base URL at one of these.</p>
  {#if !address}
    <p class="popover-error">Not connected to the proxy.</p>
  {:else if loadFailed}
    <p class="popover-error">Couldn't load the list from the proxy.</p>
  {:else if !upstreams}
    <p class="popover-hint">Loading...</p>
  {:else}
    <ul class="upstream-list">
      {#each upstreams as upstream (upstream.name)}
        <li class="upstream">
          <span class="upstream-name">{upstream.name}</span>
          <code class="upstream-url">{baseUrl(upstream.name)}</code>
          <button
            type="button"
            class="small-btn"
            aria-label={`Copy the ${upstream.name} base URL`}
            onclick={() => copy(upstream.name)}
          >
            {copied?.name === upstream.name ? copied.label : 'Copy'}
          </button>
          <span class="upstream-target">to {upstream.target}</span>
        </li>
      {/each}
    </ul>
  {/if}
</Popover>
