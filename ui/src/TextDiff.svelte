<script lang="ts">
import type { Change } from 'diff';
import { diffRows } from './lib/compare.js';

let { changes }: { changes: Change[] } = $props();

const rows = $derived(diffRows(changes));
// Folded runs the user opened, by row index.
let unfolded = $state<Record<number, boolean>>({});

const SIGNS = { same: ' ', added: '+', removed: '-' } as const;
</script>

<div class="diff">
  {#each rows as row, i}
    {#if row.kind !== 'fold'}
      <div class="diff-line diff-{row.kind}"><span class="diff-sign">{SIGNS[row.kind]}</span>{row.text}</div>
    {:else if unfolded[i]}
      {#each row.lines as text}
        <div class="diff-line diff-same"><span class="diff-sign"> </span>{text}</div>
      {/each}
    {:else}
      <button type="button" class="diff-fold" onclick={() => (unfolded[i] = true)}>
        ⋯ {row.lines.length} unchanged {row.lines.length === 1 ? 'line' : 'lines'}
      </button>
    {/if}
  {/each}
</div>
