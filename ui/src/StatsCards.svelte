<script lang="ts">
// Above the panes: counts over the calls the list shows.
import type { StatsCard } from './lib/stats.js';

let {
	shown,
	cards,
}: {
	/** Hidden while the list is empty. */
	shown: boolean;
	cards: StatsCard[];
} = $props();
</script>

{#if shown}
<section class="stats-cards" aria-label="Counts over the calls shown">
  {#each cards as card (card.label)}
    <div class="stats-card" class:alert={card.alert} title={card.title}>
      <span class="stats-label">{card.label}</span>
      <span class="stats-value">{card.value}</span>
      {#if card.detail}
        <span class="stats-detail">{card.detail}</span>
      {/if}
    </div>
  {/each}
</section>
{/if}
