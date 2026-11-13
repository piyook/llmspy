<script lang="ts">
import type { LlmPart } from './lib/types.js';

let { part, toolNames }: { part: LlmPart; toolNames: Map<string, string> } =
	$props();
</script>

{#if part.type === 'text'}
  <div class="part-text">{part.text}</div>
{:else if part.type === 'thinking'}
  <details class="part-thinking">
    <summary>Thinking</summary>
    <div class="part-text">{part.text}</div>
  </details>
{:else if part.type === 'tool_call'}
  <div class="part-tool">
    <div class="part-label">
      ⚙ tool call <code>{part.name}</code>
      <span class="part-id">{part.id}</span>
    </div>
    <pre class="json-viewer">{JSON.stringify(part.input, null, 2)}</pre>
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
    <div class="part-text part-result">{part.content}</div>
  </div>
{:else if part.type === 'image'}
  <div class="part-label">[image]</div>
{:else}
  <pre class="json-viewer">{JSON.stringify(part.raw, null, 2)}</pre>
{/if}
