<script lang="ts">
import type { Change } from 'diff';
import CompareTools from './CompareTools.svelte';
import {
	fieldChanges,
	type MessageChanges,
	messageSummary,
	unreadCalls,
} from './lib/compare.js';
import type { LlmExchange } from './lib/types.js';

// before: the other call. after: this call. system and messages come from
// the parent, which also shows them in full.
let {
	before,
	after,
	system,
	messages,
}: {
	before: LlmExchange;
	after: LlmExchange;
	system?: Change[];
	messages: MessageChanges;
} = $props();

const fields = $derived(fieldChanges(before, after));
</script>

{#if before.parseError || after.parseError}
  <p class="notice">
    LLMSpy could not fully read {unreadCalls(!!after.parseError, !!before.parseError)},
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
  <dd><CompareTools {before} {after} /></dd>

  <dt>messages</dt>
  <dd>{messageSummary(messages)}</dd>
</dl>
