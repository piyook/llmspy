<script lang="ts">
// Above the list: shows only the tab's failed calls, on every day.
let {
	pressed,
	count,
	ontoggle,
}: {
	pressed: boolean;
	/** How many of the tab's calls failed. */
	count: number;
	ontoggle: () => void;
} = $props();
</script>

<!-- Hidden when there is nothing to show, except while pressed, so it can be
     turned off again. -->
{#if pressed || count > 0}
  <div class="failed-bar">
    <button
      type="button"
      class="chip failed-chip"
      aria-pressed={pressed}
      title="Show only the calls that failed: an error, a status of 400 or above, or an error in the reply"
      onclick={ontoggle}
    >Failed {count}</button>
  </div>
{/if}
