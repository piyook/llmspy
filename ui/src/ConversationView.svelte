<script lang="ts">
import { toolNames, usageSummary } from './lib/conversation.js';
import type { LlmExchange } from './lib/types.js';
import Message from './Message.svelte';

let { llm }: { llm: LlmExchange } = $props();

const names = $derived(toolNames(llm));
const usage = $derived(usageSummary(llm.usage));

// Whether each message is unfolded, by index, plus `reply`. Missing means unfolded.
let open = $state<Record<string, boolean>>({});

function setAll(value: boolean) {
	const next: Record<string, boolean> = { reply: value };
	for (let i = 0; i < llm.messages.length; i++) next[i] = value;
	open = next;
}
</script>

{#if llm.parseError}
  <p class="notice">
    LLMSpy could not fully read this call ({llm.parseError}). The Raw tab
    shows it as sent.
  </p>
{/if}

<p class="conv-meta">
  <span>{llm.format}</span>
  {#if llm.model}<span>{llm.model}</span>{/if}
  <span>{llm.stream ? 'streamed' : 'not streamed'}</span>
</p>

{#if llm.system}
  <details class="section">
    <summary>System prompt</summary>
    <div class="part-text">{llm.system}</div>
  </details>
{/if}

{#if llm.tools?.length}
  <details class="section">
    <summary>Tools ({llm.tools.length})</summary>
    <ul class="tool-list">
      {#each llm.tools as tool}
        <li>
          <code>{tool.name}</code>
          {#if tool.description}<span class="tool-description">{tool.description}</span>{/if}
        </li>
      {/each}
    </ul>
  </details>
{/if}

<div class="conv-actions">
  <span>{llm.messages.length} messages</span>
  <button type="button" class="small-btn" onclick={() => setAll(false)}>Fold all</button>
  <button type="button" class="small-btn" onclick={() => setAll(true)}>Unfold all</button>
</div>

{#each llm.messages as message, i}
  <Message
    {message}
    toolNames={names}
    bind:open={() => open[i] ?? true, (value) => (open[i] = value)}
  />
{/each}

{#if llm.output}
  <h3 class="reply-heading">Reply</h3>
  <Message
    message={llm.output}
    toolNames={names}
    bind:open={() => open.reply ?? true, (value) => (open.reply = value)}
  />
{/if}

{#if llm.stopReason || usage.length}
  <p class="conv-footer">
    {#if llm.stopReason}<span>stop: {llm.stopReason}</span>{/if}
    {#each usage as item}<span>{item}</span>{/each}
  </p>
{/if}
