<script lang="ts">
import CompareSummary from './CompareSummary.svelte';
import CompareUsage from './CompareUsage.svelte';
import {
	bodyChanges,
	messageChanges,
	textChanges,
	unreadCalls,
	usageChanges,
} from './lib/compare.js';
import { formatTime } from './lib/format.js';
import type { CapturedRequest, LlmExchange } from './lib/types.js';
import OnlyInCall from './OnlyInCall.svelte';
import TextDiff from './TextDiff.svelte';

// request: the selected call. other: the call it is compared with.
// picking: whether the next click in the list picks `other`.
let {
	request,
	other,
	picking,
	onpick,
}: {
	request: CapturedRequest;
	other?: CapturedRequest;
	picking: boolean;
	onpick: () => void;
} = $props();

// Both parsed, or neither: the summary needs both.
const pair = $derived(
	request.llm && other?.llm
		? { call: request.llm, other: other.llm }
		: undefined,
);
// Every difference, including settings and tool schemas the summary leaves out.
const body = $derived(
	other ? bodyChanges(other.body, request.body) : undefined,
);
</script>

{#snippet label(call: CapturedRequest)}
  <span class="compare-call">
    <span class="row-time">{formatTime(call.timestamp)}</span>
    <span class="row-provider">{call.provider}</span>
    <span>{call.llm?.model ?? call.path}</span>
  </span>
{/snippet}

<div class="compare-head">
  <div class="compare-calls">
    <span class="compare-role compare-this">This call</span>
    {@render label(request)}
    <span class="compare-role compare-other">Compared with</span>
    {#if other}
      {@render label(other)}
    {:else}
      <span class="compare-call">no earlier call to {request.provider}</span>
    {/if}
  </div>
  <button type="button" class="small-btn" aria-pressed={picking} onclick={onpick}>
    {picking ? 'Click a call in the list…' : 'Compare with another call'}
  </button>
</div>

{#if other && !pair}
  <p class="notice">
    LLMSpy could not read {unreadCalls(!request.llm, !other.llm)}
    as an LLM call, so only the request bodies are compared.
  </p>
{/if}

{#if pair}
  {@render summary(pair.other, pair.call)}
{/if}

{#if body === 'same'}
  <p class="compare-note">The request bodies are the same.</p>
{:else if body === 'too-slow'}
  <p class="notice">
    The request bodies are too large and different to compare here. The Raw
    tab of each call shows them in full.
  </p>
{:else if body}
  <details class="section" open={!pair}>
    <summary>Request body</summary>
    <TextDiff changes={body} />
  </details>
{/if}

{#snippet summary(before: LlmExchange, after: LlmExchange)}
  {@const system = textChanges(before.system, after.system)}
  {@const messages = messageChanges(before.messages, after.messages)}

  <CompareSummary {before} {after} {system} {messages} />
  <CompareUsage usage={usageChanges(before.usage, after.usage)} />

  {#if system}
    <details class="section" open>
      <summary>System prompt</summary>
      <TextDiff changes={system} />
    </details>
  {/if}

  <OnlyInCall which="the other call" messages={messages.other} exchange={before} />
  <OnlyInCall which="this call" messages={messages.call} exchange={after} />
{/snippet}
