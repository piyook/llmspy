<script lang="ts">
import { type Snippet, tick } from 'svelte';

let {
	id,
	label,
	buttonClass = 'header-btn',
	buttonLabel,
	align = 'end',
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
	/** Where the panel sits under the button: centred, or level with its right edge. */
	align?: 'center' | 'end';
	onopen?: () => void;
	trigger: Snippet;
	children: Snippet;
} = $props();

let open = $state(false);
let wrapper: HTMLDivElement;
let button: HTMLButtonElement;
let panel = $state<HTMLDivElement>();
// How far the panel is moved sideways to stay inside the window, in px.
let shift = $state(0);

/** The closest the panel may come to either side of the window, in px. */
const EDGE = 16;

// Measured without the current shift, so it settles in one pass.
function fit() {
	if (!panel) return;
	const rect = panel.getBoundingClientRect();
	const left = rect.left - shift;
	const right = rect.right - shift;
	if (left < EDGE) shift = EDGE - left;
	else if (right > window.innerWidth - EDGE) {
		shift = window.innerWidth - EDGE - right;
	} else shift = 0;
}

// Again whenever the panel changes size, e.g. when its content has loaded.
$effect(() => {
	if (!panel) return;
	const observer = new ResizeObserver(fit);
	observer.observe(panel);
	return () => observer.disconnect();
});

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

<svelte:window
  onpointerdown={onWindowPointerDown}
  onkeydown={onWindowKeyDown}
  onresize={fit}
/>

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
      class:popover-center={align === 'center'}
      style:translate={shift ? `${shift}px 0` : undefined}
      role="dialog"
      aria-label={label}
      tabindex="-1"
      bind:this={panel}
    >
      {@render children()}
    </div>
  {/if}
</div>
