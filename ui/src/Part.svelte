<script lang="ts">
import Copyable from './Copyable.svelte';
import type { LlmPart } from './lib/types.js';

let { part, toolNames }: { part: LlmPart; toolNames: Map<string, string> } =
	$props();

const json = $derived(
	part.type === 'tool_call'
		? JSON.stringify(part.input, null, 2)
		: part.type === 'other'
			? JSON.stringify(part.raw, null, 2)
			: '',
);
</script>

{#if part.type === 'text'}
  <Copyable text={part.text}>
    <div class="part-text">{part.text}</div>
  </Copyable>
{:else if part.type === 'thinking'}
  <details class="part-thinking">
    <summary>Thinking</summary>
    <Copyable text={part.text}>
      <div class="part-text">{part.text}</div>
    </Copyable>
  </details>
{:else if part.type === 'tool_call'}
  <div class="part-tool">
    <div class="part-label">
      ⚙ tool call <code>{part.name}</code>
      <span class="part-id">{part.id}</span>
    </div>
    <Copyable text={json}>
      <pre class="json-viewer">{json}</pre>
    </Copyable>
  </div>
{:else if part.type === 'tool_result'}
  <div class="part-tool" class:part-error={part.isError}>
    <div class="part-label">
      ↳ result of <code>{toolNames.get(part.id) ?? 'unknown tool'}</code>
      <span class="part-id">{part.id}</span>
      {#if part.isError}
        <span class="status-error">error</span>
      {/if}
    </div>
    <Copyable text={part.content}>
      <div class="part-text part-result">{part.content}</div>
    </Copyable>
  </div>
{:else if part.type === 'image'}
  <div class="part-label">[image]</div>
{:else}
  <Copyable text={json}>
    <pre class="json-viewer">{json}</pre>
  </Copyable>
{/if}
