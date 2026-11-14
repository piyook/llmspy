<script lang="ts">
import {
	formatLatency,
	formatTime,
	formatTokens,
	statusClass,
} from './lib/format.js';
import type { CapturedRequest } from './lib/types.js';

let {
	request,
	selected,
	onselect,
}: { request: CapturedRequest; selected: boolean; onselect: () => void } =
	$props();

const usage = $derived(request.llm?.usage);
const hasTokens = $derived(
	usage?.input !== undefined || usage?.output !== undefined,
);
</script>

<button
  type="button"
  class="row"
  class:selected
  aria-pressed={selected}
  onclick={onselect}
>
  <span class="row-line">
    <span class="row-time">{formatTime(request.timestamp)}</span>
    {#if request.response}
      <span class={statusClass(request.response.status)}>{request.response.status}</span>
    {:else if request.error}
      <span class="status-error">error</span>
    {/if}
    {#if request.llm?.error}
      <!-- A 200 whose reply failed part-way, such as an error event in a stream. -->
      <span class="status-error" title={request.llm.error.message}>error</span>
    {/if}
    {#if request.latency !== undefined}
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
