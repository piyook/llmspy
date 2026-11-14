<script lang="ts">
import CompareView from './CompareView.svelte';
import ConversationView from './ConversationView.svelte';
import type { CapturedRequest, Tab } from './lib/types.js';
import RawView from './RawView.svelte';

// chosen: the tab last picked, kept by the caller across requests.
// other, picking, onpick: what the Compare tab compares with; see CompareView.
let {
	request,
	other,
	picking,
	onpick,
	chosen = $bindable('conversation'),
}: {
	request: CapturedRequest;
	other?: CapturedRequest;
	picking: boolean;
	onpick: () => void;
	chosen?: Tab;
} = $props();

// Calls LLMSpy could not parse have no Conversation, so they show Raw
// without changing the pick for the next request.
const tab = $derived<Tab>(
	chosen === 'conversation' && !request.llm ? 'raw' : chosen,
);
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
  <button
    type="button"
    class="tab"
    class:active={tab === 'compare'}
    aria-pressed={tab === 'compare'}
    onclick={() => (chosen = 'compare')}>Compare</button
  >
</div>

{#if tab === 'conversation' && request.llm}
  <!-- Keyed, so the fold state starts fresh for each request. -->
  {#key request.id}
    <ConversationView llm={request.llm} captureError={request.error} />
  {/key}
{:else if tab === 'compare'}
  {#key `${request.id} ${other?.id}`}
    <CompareView {request} {other} {picking} {onpick} />
  {/key}
{:else}
  <RawView {request} />
{/if}
