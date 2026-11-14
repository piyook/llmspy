<script lang="ts">
import { type Snippet, tick } from 'svelte';

let {
	id,
	label,
	buttonClass = 'header-btn',
	buttonLabel,
	onopen,
	trigger,
	children,
}: {
	/** The panel's element id. */
	id: string;
	/** The panel's accessible name. */
	label: string;
	buttonClass?: string;
	/** Accessible name and tooltip for a button whose content is only an icon. */
	buttonLabel?: string;
	onopen?: () => void;
	trigger: Snippet;
	children: Snippet;
} = $props();

let open = $state(false);
let wrapper: HTMLDivElement;
let button: HTMLButtonElement;
let panel = $state<HTMLDivElement>();

async function show() {
	open = true;
	onopen?.();
	await tick();
	panel?.focus();
}

function hide(returnFocus: boolean) {
	open = false;
	if (returnFocus) button.focus();
}

function toggle() {
	if (open) hide(false);
	else show();
}

function onWindowPointerDown(event: PointerEvent) {
	if (open && !wrapper.contains(event.target as Node)) hide(false);
}

function onWindowKeyDown(event: KeyboardEvent) {
	if (open && event.key === 'Escape') hide(true);
}

// Tabbing out of the popover closes it, like a click outside.
function onFocusOut(event: FocusEvent) {
	const next = event.relatedTarget as Node | null;
	if (open && next && !wrapper.contains(next)) hide(false);
}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeyDown} />

<div class="popover-wrapper" bind:this={wrapper} onfocusout={onFocusOut}>
  <button
    type="button"
    class={buttonClass}
    aria-expanded={open}
    aria-controls={id}
    aria-haspopup="dialog"
    aria-label={buttonLabel}
    title={buttonLabel}
    bind:this={button}
    onclick={toggle}
  >
    {@render trigger()}
  </button>

  {#if open}
    <div
      {id}
      class="popover"
      role="dialog"
      aria-label={label}
      tabindex="-1"
      bind:this={panel}
    >
      {@render children()}
    </div>
  {/if}
</div>
