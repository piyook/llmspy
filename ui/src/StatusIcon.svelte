<script lang="ts">
let { connected, address }: { connected: boolean; address?: string } = $props();

const label = $derived(
	connected
		? `Listening${address ? ` on ${address}` : ''}`
		: 'Not connected to the proxy',
);
</script>

<span
  class="status-icon"
  class:connected
  role="status"
  title={label}
>
  <svg
    viewBox="0 0 30 24"
    width="45"
    height="36"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- Ear on the left: outer rim down to the lobe, then the inner fold. -->
    <path d="M4 9.5A6.5 6.5 0 0 1 17 9.5C17 14 12.5 15 12.5 18.5A3.5 3.5 0 0 1 5.5 18.5" />
    <path d="M13.5 9.5A3 3 0 0 0 7.5 9.5v1a2 2 0 0 1 0 4" />
    {#if connected}
      <!-- Sound waves on the right, lit outermost first so they travel into the ear. -->
      <path class="wave wave-far" d="M26 4.5a10 10 0 0 1 0 15" />
      <path class="wave wave-mid" d="M22.5 7a7 7 0 0 1 0 10" />
      <path class="wave wave-near" d="M19.5 9.5a3.5 3.5 0 0 1 0 5" />
    {:else}
      <line x1="3" y1="4" x2="18" y2="21" />
    {/if}
  </svg>
  <span class="visually-hidden">{label}</span>
</span>
