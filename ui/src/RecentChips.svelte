<script lang="ts">
// Under Today's heading: narrows today's calls to the last few minutes.
import { RECENT_MINUTES } from './lib/days.js';

let {
	shown,
	minutes,
	count,
	onchoose,
}: {
	/** Whether the chips are shown at all. */
	shown: boolean;
	/** The window chosen, or undefined for all of today. */
	minutes: number | undefined;
	/** How many of today's calls are shown. */
	count: number;
	onchoose: (minutes: number | undefined) => void;
} = $props();
</script>

{#if shown}
  <div class="recent-chips" role="group" aria-label="Show today's calls from the last">
    <button
      type="button"
      class="chip"
      aria-pressed={minutes === undefined}
      onclick={() => onchoose(undefined)}
    >All</button>
    {#each RECENT_MINUTES as option (option)}
      <button
        type="button"
        class="chip"
        aria-pressed={minutes === option}
        title="Calls from the last {option} minutes"
        onclick={() => onchoose(option)}
      >{option}m</button>
    {/each}
  </div>
  {#if count === 0}
    <p class="recent-empty">No calls in the last {minutes} min.</p>
  {/if}
{/if}
