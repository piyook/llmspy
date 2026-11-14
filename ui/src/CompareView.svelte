<script lang="ts">
import {
	bodyChanges,
	fieldChanges,
	formatDelta,
	messageChanges,
	messageSummary,
	textChanges,
	toolChanges,
	usageChanges,
} from './lib/compare.js';
import { toolNames } from './lib/conversation.js';
import { formatTime } from './lib/format.js';
import type { CapturedRequest, LlmExchange } from './lib/types.js';
import Message from './Message.svelte';
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
    LLMSpy could not read {!request.llm && !other.llm ? 'either call' : request.llm ? 'the other call' : 'this call'}
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
  {@const fields = fieldChanges(before, after)}
  {@const system = textChanges(before.system, after.system)}
  {@const tools = toolChanges(before, after)}
  {@const messages = messageChanges(before.messages, after.messages)}
  {@const usage = usageChanges(before.usage, after.usage)}

  {#if before.parseError || after.parseError}
    <p class="notice">
      LLMSpy could not fully read {before.parseError && after.parseError ? 'either call' : before.parseError ? 'the other call' : 'this call'},
      so this summary may miss differences.
    </p>
  {/if}

  <dl class="compare-summary">
    {#each fields as field}
      <dt>{field.label}</dt>
      <dd><span class="compare-old">{field.other}</span> → <span class="compare-new">{field.call}</span></dd>
    {/each}

    <dt>system prompt</dt>
    <dd>{system ? 'changed, see below' : before.system ? 'same' : 'none'}</dd>

    <dt>tools</dt>
    <dd>
      {#if tools}
        {#each tools.added as name}<code class="compare-new">+{name}</code> {/each}
        {#each tools.removed as name}<code class="compare-old">-{name}</code> {/each}
        {#each tools.changed as name}<code>~{name}</code> {/each}
        {#if tools.changed.length}<span class="compare-note">(~ description changed)</span>{/if}
      {:else}
        {after.tools?.length ? `same (${after.tools.length})` : 'none'}
      {/if}
    </dd>

    <dt>messages</dt>
    <dd>{messageSummary(messages)}</dd>
  </dl>

  {#if usage.length}
    <table class="compare-usage">
      <thead>
        <tr><th>tokens</th><th>other call</th><th>this call</th><th></th></tr>
      </thead>
      <tbody>
        {#each usage as row}
          <tr>
            <th>{row.label}</th>
            <td>{row.other?.toLocaleString() ?? '-'}</td>
            <td>{row.call?.toLocaleString() ?? '-'}</td>
            <td class="compare-note">{formatDelta(row)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if system}
    <details class="section" open>
      <summary>System prompt</summary>
      <TextDiff changes={system} />
    </details>
  {/if}

  {#if messages.other.length}
    {@const names = toolNames(before)}
    <details class="section" open>
      <summary>Only in the other call ({messages.other.length})</summary>
      {#each messages.other as message}
        <Message {message} toolNames={names} />
      {/each}
    </details>
  {/if}

  {#if messages.call.length}
    {@const names = toolNames(after)}
    <details class="section" open>
      <summary>Only in this call ({messages.call.length})</summary>
      {#each messages.call as message}
        <Message {message} toolNames={names} />
      {/each}
    </details>
  {/if}
{/snippet}
