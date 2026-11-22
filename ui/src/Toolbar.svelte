<script lang="ts">
import HelpPopover from './HelpPopover.svelte';
import SettingsPopover from './SettingsPopover.svelte';
import StatusIcon from './StatusIcon.svelte';
import UpstreamPopover from './UpstreamPopover.svelte';

let {
	search = $bindable(''),
	connected,
	address,
	version,
	exportHref,
	onclear,
}: {
	search: string;
	connected: boolean;
	address?: string;
	version?: string;
	/** Where Export downloads the listed calls from; undefined when none are listed. */
	exportHref?: string;
	onclear: () => void;
} = $props();

const EXPORT_TITLE =
	'Save the calls in this list as an llm-capture file (calls still running are left out)';
</script>

<div class="header">
  <div class="title">
    <img class="logo" src="/logo.svg" alt="" width="40" height="40" />
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
    {#if exportHref}
      <a class="header-btn" href={exportHref} download title={EXPORT_TITLE}>Export</a>
    {:else}
      <button type="button" class="header-btn" disabled title="No calls to export">Export</button>
    {/if}
    <button type="button" class="clear-btn" onclick={onclear}>Clear All</button>
    <HelpPopover address={connected ? address : undefined} />
    <SettingsPopover {version} />
  </div>
</div>
