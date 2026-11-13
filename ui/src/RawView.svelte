<script lang="ts">
import Body from './Body.svelte';
import type { CapturedRequest } from './lib/types.js';

let { request }: { request: CapturedRequest } = $props();
</script>

<p class="raw-target">{request.method} {request.host}{request.path}</p>
{#if request.error}
  <p class="status-error">{request.error}</p>
{/if}

<!-- One component instance serves every selected request, so a section
     folded here stays folded when another request is selected. -->
<details class="section" open>
  <summary>Request Headers</summary>
  <pre class="json-viewer">{JSON.stringify(request.headers, null, 2)}</pre>
</details>

<details class="section" open>
  <summary>Request Body</summary>
  <Body body={request.body} />
</details>

{#if request.response}
  <details class="section" open>
    <summary>Response Headers</summary>
    <pre class="json-viewer">{JSON.stringify(request.response.headers, null, 2)}</pre>
  </details>

  <details class="section" open>
    <summary>Response Body</summary>
    <Body body={request.response.body} />
  </details>
{/if}
