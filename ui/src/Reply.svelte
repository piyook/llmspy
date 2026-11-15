<script lang="ts">
import type { LlmMessage } from './lib/types.js';
import Message from './Message.svelte';

// The reply. While the call runs (`running`) it shows once part of it has
// arrived, and until then a waiting notice.
let {
	output,
	toolNames,
	running,
	open = $bindable(true),
}: {
	output?: LlmMessage;
	toolNames: Map<string, string>;
	running: boolean;
	open?: boolean;
} = $props();

const show = $derived(
	output !== undefined && (output.parts.length > 0 || !running),
);
</script>

{#if show || running}
  <h3 class="reply-heading">Reply</h3>
{/if}
{#if output && show}
  <Message message={output} {toolNames} bind:open />
  {#if running}
    <p class="notice" role="status">Replying: this grows as the reply arrives.</p>
  {/if}
{:else if running}
  <p class="notice" role="status">
    Waiting for the reply. A streamed reply shows here as it arrives, any
    other when the call ends; the Raw tab has the request as sent.
  </p>
{/if}
