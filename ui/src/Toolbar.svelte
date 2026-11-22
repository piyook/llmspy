<script lang="ts">
import { tick } from 'svelte';
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

// On a narrow window the controls beside the search sit in a drawer that
// slides in from the right; on a wide one they are in the header and this
// is unused (app.css switches at the same width).
let menuOpen = $state(false);
let menuButton: HTMLButtonElement;
let menu: HTMLDivElement;

async function openMenu() {
	menuOpen = true;
	await tick();
	menu.querySelector<HTMLElement>('button, a[href]')?.focus();
}

function closeMenu(returnFocus: boolean) {
	menuOpen = false;
	if (returnFocus) menuButton.focus();
}

function onWindowPointerDown(event: PointerEvent) {
	const target = event.target as Node;
	if (menuOpen && !menu.contains(target) && !menuButton.contains(target)) {
		closeMenu(false);
	}
}

// Escape closes a popover open in the drawer first, and the drawer after.
function onWindowKeyDown(event: KeyboardEvent) {
	if (!menuOpen || event.key !== 'Escape') return;
	if (menu.querySelector('[aria-expanded="true"]')) return;
	closeMenu(true);
}

// Tabbing out of the drawer closes it, like a click outside. When it is
// closed (or on a wide window, where it is not a drawer) this does nothing.
function onMenuFocusOut(event: FocusEvent) {
	const next = event.relatedTarget as Node | null;
	if (next && !menu.contains(next) && next !== menuButton) {
		closeMenu(false);
	}
}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeyDown} />

<div class="header">
  <div class="title">
    <StatusIcon {connected} {address} />
    <h1>LLMSpy</h1>
  </div>
  <div class="controls">
    <input
      type="search"
      placeholder="Search requests..."
      aria-label="Search requests"
      class="search"
      bind:value={search}
    />
    <button
      type="button"
      class="icon-btn menu-btn"
      aria-label="Menu"
      title="Menu"
      aria-expanded={menuOpen}
      aria-controls="header-menu"
      bind:this={menuButton}
      onclick={() => (menuOpen ? closeMenu(false) : openMenu())}
    >
      <!-- Three lines. -->
      <svg
        viewBox="0 0 24 24"
        width="28"
        height="28"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <div
      id="header-menu"
      class="menu"
      class:menu-open={menuOpen}
      bind:this={menu}
      onfocusout={onMenuFocusOut}
    >
      <button
        type="button"
        class="icon-btn menu-close"
        aria-label="Close the menu"
        title="Close the menu"
        onclick={() => closeMenu(true)}
      >
        <!-- A cross. -->
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div class="menu-upstreams">
        <UpstreamPopover address={connected ? address : undefined} />
      </div>
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
</div>
