<script lang="ts">
import { usageSummary } from './lib/conversation.js';
import type { LlmExchange } from './lib/types.js';

let { llm }: { llm: LlmExchange } = $props();

const usage = $derived(usageSummary(llm.usage));
</script>

{#if llm.stopReason || usage.length}
  <p class="conv-footer">
    {#if llm.stopReason}<span>stop: {llm.stopReason}</span>{/if}
    {#each usage as item}<span>{item}</span>{/each}
  </p>
{/if}
