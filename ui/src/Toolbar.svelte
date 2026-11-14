<script lang="ts">
import StatusIcon from './StatusIcon.svelte';
import UpstreamPopover from './UpstreamPopover.svelte';

let {
	search = $bindable(''),
	connected,
	address,
	onclear,
}: {
	search: string;
	connected: boolean;
	address?: string;
	onclear: () => void;
} = $props();
</script>

<div class="header">
  <div class="title">
    <h1>LLMSpy</h1>
    <StatusIcon {connected} {address} />
  </div>
  <div class="controls">
    <UpstreamPopover address={connected ? address : undefined} />
    <input
      type="search"
      placeholder="Search requests..."
      aria-label="Search requests"
      class="search"
      bind:value={search}
    />
    <button type="button" class="clear-btn" onclick={onclear}>Clear All</button>
  </div>
</div>
