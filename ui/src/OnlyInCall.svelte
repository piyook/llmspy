<script lang="ts">
import { toolNames } from './lib/conversation.js';
import type { LlmExchange, LlmMessage } from './lib/types.js';
import Message from './Message.svelte';

// which: names the call in the heading. exchange: the call the messages
// come from, for its tool names.
let {
	which,
	messages,
	exchange,
}: { which: string; messages: LlmMessage[]; exchange: LlmExchange } = $props();

const names = $derived(toolNames(exchange));
</script>

{#if messages.length}
  <details class="section" open>
    <summary>Only in {which} ({messages.length})</summary>
    {#each messages as message}
      <Message {message} toolNames={names} />
    {/each}
  </details>
{/if}
