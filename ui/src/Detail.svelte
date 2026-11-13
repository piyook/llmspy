<script lang="ts">
import ConversationView from './ConversationView.svelte';
import type { CapturedRequest } from './lib/types.js';
import RawView from './RawView.svelte';

type Tab = 'conversation' | 'raw';

let { request }: { request: CapturedRequest } = $props();

// The tab last picked. Calls LLMSpy could not parse only have Raw, so they
// show Raw without changing the pick for the next request.
let chosen = $state<Tab>('conversation');
const tab = $derived<Tab>(request.llm ? chosen : 'raw');
</script>

<div class="tabs" role="group" aria-label="View">
  {#if request.llm}
    <button
      type="button"
      class="tab"
      class:active={tab === 'conversation'}
      aria-pressed={tab === 'conversation'}
      onclick={() => (chosen = 'conversation')}>Conversation</button
    >
  {/if}
  <button
    type="button"
    class="tab"
    class:active={tab === 'raw'}
    aria-pressed={tab === 'raw'}
    onclick={() => (chosen = 'raw')}>Raw</button
  >
</div>

{#if tab === 'conversation' && request.llm}
  <!-- Keyed, so the fold state starts fresh for each request. -->
  {#key request.id}
    <ConversationView llm={request.llm} />
  {/key}
{:else}
  <RawView {request} />
{/if}
