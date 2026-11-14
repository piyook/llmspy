<script lang="ts">
import { toolChanges } from './lib/compare.js';
import type { LlmExchange } from './lib/types.js';

// before: the other call. after: this call.
let { before, after }: { before: LlmExchange; after: LlmExchange } = $props();

const tools = $derived(toolChanges(before, after));
</script>

{#if tools}
  {#each tools.added as name}<code class="compare-new">+{name}</code> {/each}
  {#each tools.removed as name}<code class="compare-old">-{name}</code> {/each}
  {#each tools.changed as name}<code>~{name}</code> {/each}
  {#if tools.changed.length}<span class="compare-note">(~ description changed)</span>{/if}
{:else}
  {after.tools?.length ? `same (${after.tools.length})` : 'none'}
{/if}
