<script lang="ts">
import type { LlmExchange } from './lib/types.js';

let { tools }: { tools: NonNullable<LlmExchange['tools']> } = $props();
</script>

{#if tools.length}
  <details class="section">
    <summary>Tools ({tools.length})</summary>
    <ul class="tool-list">
      {#each tools as tool}
        <li>
          <code>{tool.name}</code>
          {#if tool.description}<span class="tool-description">{tool.description}</span>{/if}
        </li>
      {/each}
    </ul>
  </details>
{/if}
