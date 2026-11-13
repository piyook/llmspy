<script lang="ts">
import { preview } from './lib/conversation.js';
import type { LlmMessage } from './lib/types.js';
import Part from './Part.svelte';

let {
	message,
	toolNames,
	open = $bindable(true),
}: {
	message: LlmMessage;
	toolNames: Map<string, string>;
	open?: boolean;
} = $props();
</script>

<details class="message role-{message.role}" bind:open>
  <summary>
    <span class="role">{message.role}</span>
    {#if !open}
      <span class="preview">{preview(message, toolNames)}</span>
    {/if}
  </summary>
  {#each message.parts as part}
    <Part {part} {toolNames} />
  {/each}
</details>
