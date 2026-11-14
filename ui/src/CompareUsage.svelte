<script lang="ts">
import { formatDelta, type UsageChange } from './lib/compare.js';

let { usage }: { usage: UsageChange[] } = $props();
</script>

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
