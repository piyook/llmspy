<script lang="ts">
import type { Snippet } from 'svelte';

// A box with a Copy button in its top-right corner that copies `text`.
// Without the clipboard API (the UI opened over plain HTTP on a LAN address)
// there is no button.
let { text, children }: { text: string; children: Snippet } = $props();

const supported = typeof navigator !== 'undefined' && !!navigator.clipboard;
const RESET_MS = 1500;

let label = $state('Copy');
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy() {
	try {
		await navigator.clipboard.writeText(text);
		label = 'Copied';
	} catch {
		label = 'Copy failed';
	}
	clearTimeout(timer);
	timer = setTimeout(() => (label = 'Copy'), RESET_MS);
}

$effect(() => () => clearTimeout(timer));
</script>

<div class="copyable">
  {@render children()}
  {#if supported}
    <button
      type="button"
      class="small-btn copy-btn"
      class:shown={label !== 'Copy'}
      onclick={copy}
    >{label}</button>
  {/if}
</div>
