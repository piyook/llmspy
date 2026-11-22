<script lang="ts">
let { connected, address }: { connected: boolean; address?: string } = $props();

const label = $derived(
	connected
		? `Listening${address ? ` on ${address}` : ''}`
		: 'Not connected to the proxy',
);
</script>

<!-- The logo (public/logo.svg) drawn inline, so its magnifying glass can show the connection. -->
<span
  class="logo status-icon"
  class:connected
  role="status"
  title={label}
>
  <svg viewBox="0 0 64 64" width="40" height="40" fill="none" aria-hidden="true">
    <rect x="6" y="6" width="52" height="52" rx="14" fill="#2D333B" />
    <path d="M16 21h22v4H16v-4Zm0 9h16v4H16v-4Zm0 9h10v4H16v-4Z" fill="#646CFF" />
    <g class="glass" stroke="currentColor" stroke-width="4" stroke-linecap="round">
      <circle class="lens" cx="41" cy="40" r="8" fill="currentColor" fill-opacity="0" />
      <path d="m47 46 5 5" />
      {#if !connected}
        <!-- Struck through the lens, bottom left to top right. -->
        <path d="m36.5 44.5 9-9" stroke-width="3" />
      {/if}
    </g>
  </svg>
  <span class="visually-hidden">{label}</span>
</span>
