<script lang="ts">
import type { Snippet } from 'svelte';

let {
	open,
	title,
	confirmLabel,
	onconfirm,
	oncancel,
	children,
}: {
	/** Shown as a modal while true. */
	open: boolean;
	title: string;
	/** The red button that goes ahead, such as `Clear`. */
	confirmLabel: string;
	onconfirm: () => void;
	/** Cancel, Escape, or a click on the backdrop. */
	oncancel: () => void;
	children: Snippet;
} = $props();

let dialog: HTMLDialogElement;

// A modal <dialog> keeps the focus inside it and closes on Escape by itself.
$effect(() => {
	if (open && !dialog.open) dialog.showModal();
	else if (!open && dialog.open) dialog.close();
});

// Escape fires `cancel`; the parent closes it by setting `open`.
function onCancelEvent(event: Event) {
	event.preventDefault();
	oncancel();
}

// A click on the backdrop lands on the dialog itself, outside its content.
function onClick(event: MouseEvent) {
	if (event.target === dialog) oncancel();
}
</script>

<dialog
  class="confirm-dialog"
  aria-labelledby="confirm-dialog-title"
  bind:this={dialog}
  oncancel={onCancelEvent}
  onclick={onClick}
>
  <div class="confirm-body">
    <h2 id="confirm-dialog-title">{title}</h2>
    {@render children()}
    <div class="confirm-actions">
      <!-- Cancel has the focus, so an Enter pressed by habit does nothing harmful. -->
      <!-- svelte-ignore a11y_autofocus -->
      <button type="button" class="header-btn" autofocus onclick={oncancel}>Cancel</button>
      <button type="button" class="clear-btn" onclick={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
</dialog>
