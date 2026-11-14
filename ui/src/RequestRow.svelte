<script lang="ts">
import {
	formatElapsed,
	formatLatency,
	formatTime,
	formatTokens,
	statusClass,
} from './lib/format.js';
import { callState } from './lib/requests.js';
import type { CapturedRequest } from './lib/types.js';

// comparing: whether the Compare tab is open. compared: the call it
// compares the selected one with.
let {
	request,
	selected,
	comparing = false,
	compared = false,
	onselect,
}: {
	request: CapturedRequest;
	selected: boolean;
	comparing?: boolean;
	compared?: boolean;
	onselect: () => void;
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
    {:else if request.latency !== undefined}
      <span class="latency">{formatLatency(request.latency)}</span>
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
