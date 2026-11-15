<script lang="ts">
// The heading of one day in the list, which opens and closes the day.
let {
	label,
	count,
	open,
	ontoggle,
}: {
	label: string;
	count: number;
	open: boolean;
	ontoggle: () => void;
} = $props();
</script>

<button type="button" class="day-header" aria-expanded={open} onclick={ontoggle}>
  <svg
    class="day-chevron"
    class:open
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
  <span class="day-label">{label}</span>
  <span class="day-count">{count} {count === 1 ? 'call' : 'calls'}</span>
</button>
