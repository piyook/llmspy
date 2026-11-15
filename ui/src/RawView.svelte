<script lang="ts">
import Body from './Body.svelte';
import Copyable from './Copyable.svelte';
import type { CapturedRequest } from './lib/types.js';

let { request }: { request: CapturedRequest } = $props();

const requestHeaders = $derived(JSON.stringify(request.headers, null, 2));
const responseHeaders = $derived(
	request.response ? JSON.stringify(request.response.headers, null, 2) : '',
);

// Whether each section is unfolded. One component instance serves every
// selected request, so a section folded here stays folded when another
// request is selected.
let open = $state({
	requestHeaders: true,
	requestBody: true,
	responseHeaders: true,
	responseBody: true,
});

function setAll(value: boolean) {
	open = {
		requestHeaders: value,
		requestBody: value,
		responseHeaders: value,
		responseBody: value,
	};
}
</script>

<p class="raw-target">{request.method} {request.host}{request.path}</p>
{#if request.error}
  <p class="status-error">{request.error}</p>
{/if}

<div class="conv-actions">
  <button type="button" class="small-btn" onclick={() => setAll(false)}>Fold all</button>
  <button type="button" class="small-btn" onclick={() => setAll(true)}>Unfold all</button>
</div>

<details class="section" bind:open={open.requestHeaders}>
  <summary>Request Headers</summary>
  <Copyable text={requestHeaders}>
    <pre class="json-viewer">{requestHeaders}</pre>
  </Copyable>
</details>

<details class="section" bind:open={open.requestBody}>
  <summary>Request Body</summary>
  <Body body={request.body} />
</details>

{#if request.response}
  <details class="section" bind:open={open.responseHeaders}>
    <summary>Response Headers</summary>
    <Copyable text={responseHeaders}>
      <pre class="json-viewer">{responseHeaders}</pre>
    </Copyable>
  </details>

  <details class="section" bind:open={open.responseBody}>
    <summary>Response Body</summary>
    <Body body={request.response.body} />
  </details>
{/if}
