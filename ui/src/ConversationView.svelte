<script lang="ts">
import ConversationFooter from './ConversationFooter.svelte';
import ErrorNotice from './ErrorNotice.svelte';
import { toolNames } from './lib/conversation.js';
import type { LlmExchange } from './lib/types.js';
import Message from './Message.svelte';
import ToolList from './ToolList.svelte';

// captureError: the capture's own error, such as the stream breaking off.
// running: the call has not ended yet, so there is no reply to show.
let {
	llm,
	captureError,
	running = false,
}: { llm: LlmExchange; captureError?: string; running?: boolean } = $props();

const names = $derived(toolNames(llm));
const errorTitle = $derived(
	`The provider reported an error${llm.error?.type ? `: ${llm.error.type}` : ''}`,
);
// Shown under an error notice: whether any of the reply came before the error.
const partialHint = $derived(
	llm.output?.parts.length
		? 'The reply above is what arrived before it.'
		: 'No reply arrived before it.',
);

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

<ToolList tools={llm.tools ?? []} />

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

{#if running}
  <h3 class="reply-heading">Reply</h3>
  <p class="notice" role="status">
    Waiting for the reply. It shows here when the call ends; the Raw tab has
    the request as sent.
  </p>
{:else if llm.output}
  <h3 class="reply-heading">Reply</h3>
  <Message
    message={llm.output}
    toolNames={names}
    bind:open={() => open.reply ?? true, (value) => (open.reply = value)}
  />
{/if}

{#if llm.error}
  <ErrorNotice
    title={errorTitle}
    detail={llm.error.message}
    hint={partialHint}
  />
{/if}

{#if captureError}
  <ErrorNotice title="The reply broke off" detail={captureError} hint={partialHint} />
{/if}

<ConversationFooter {llm} />
