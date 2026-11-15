<script lang="ts">
import {
	formatElapsed,
	formatLatency,
	formatTime,
	formatTokens,
	statusClass,
} from './lib/format.js';
import { callState, quietFor } from './lib/requests.js';
import type { CapturedRequest } from './lib/types.js';

// comparing: whether the Compare tab is open. compared: the call it
// compares the selected one with.
let {
	request,
	selected,
	comparing = false,
	compared = false,
	onselect,
	ondelete,
}: {
	request: CapturedRequest;
	selected: boolean;
	comparing?: boolean;
	compared?: boolean;
	onselect: () => void;
	ondelete: () => void;
} = $props();

const phase = $derived(callState(request));
// Ticks once a second, only while the call is running.
let now = $state(Date.now());
$effect(() => {
	if (phase === 'done') return;
	now = Date.now();
	const timer = setInterval(() => (now = Date.now()), 1000);
	return () => clearInterval(timer);
});
const quiet = $derived(quietFor(request, now));

const usage = $derived(request.llm?.usage);
const hasTokens = $derived(
	usage?.input !== undefined || usage?.output !== undefined,
);
// A reply that failed after its status arrived: an error the provider sent
// inside it, or the stream breaking off (the capture's own error).
const replyError = $derived(
	request.response
		? (request.llm?.error?.message ?? request.error)
		: undefined,
);
</script>

<!-- The delete button is beside the row, not in it: a button can't hold
     another. It is left out while the call runs, since the next update
     would store the call again. -->
<div class="row-wrap">
{#if phase === 'done'}
  <button
    type="button"
    class="row-delete"
    aria-label="Delete this call"
    title="Delete this call"
    onclick={ondelete}
  >
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  </button>
{/if}
<button
  type="button"
  class="row"
  class:selected
  class:current={selected && comparing}
  class:compared
  aria-pressed={selected}
  onclick={onselect}
>
  {#if compared}<span class="visually-hidden">Compared with the selected call.</span>{/if}
  <span class="row-line">
    <span class="row-time">{formatTime(request.timestamp)}</span>
    {#if request.response}
      <span class={statusClass(request.response.status)}>{request.response.status}</span>
    {:else if request.error}
      <span class="status-error" title={request.error}>error</span>
    {/if}
    {#if replyError !== undefined}
      <span class="status-error" title={replyError}>error</span>
    {/if}
    {#if phase !== 'done'}
      <span class="status-running">{phase}</span>
      <span class="latency">{formatElapsed(now - request.timings.start)}</span>
      {#if quiet !== undefined}
        <span class="status-quiet" title="No data has arrived for a while. A reasoning model can be quiet while it thinks.">quiet {formatElapsed(quiet)}</span>
      {/if}
    {:else if request.latency !== undefined}
      <span class="latency">{formatLatency(request.latency)}</span>
    {/if}
    {#if phase !== 'done'}
      <!-- A clock face at quarter past: the call has not finished yet. It
           flashes until the reply starts. -->
      <svg
        class="row-running"
        class:flashing={phase === 'waiting'}
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5h4" />
      </svg>
    {/if}
  </span>
  <span class="row-line">
    <span class="row-provider">{request.provider}</span>
    <span class="row-model">{request.llm?.model ?? request.path}</span>
  </span>
  {#if hasTokens}
    <span class="row-line row-tokens">
      {formatTokens(usage?.input)} → {formatTokens(usage?.output)} tokens
    </span>
  {/if}
</button>
</div>
