<script lang="ts">
import Body from './Body.svelte';
import Copyable from './Copyable.svelte';
import type { CapturedRequest } from './lib/types.js';

let { request }: { request: CapturedRequest } = $props();

const requestHeaders = $derived(JSON.stringify(request.headers, null, 2));
const responseHeaders = $derived(
	request.response ? JSON.stringify(request.response.headers, null, 2) : '',
);
</script>

<p class="raw-target">{request.method} {request.host}{request.path}</p>
{#if request.error}
  <p class="status-error">{request.error}</p>
{/if}

<!-- One component instance serves every selected request, so a section
     folded here stays folded when another request is selected. -->
<details class="section" open>
  <summary>Request Headers</summary>
  <Copyable text={requestHeaders}>
    <pre class="json-viewer">{requestHeaders}</pre>
  </Copyable>
</details>

<details class="section" open>
  <summary>Request Body</summary>
  <Body body={request.body} />
</details>

{#if request.response}
  <details class="section" open>
    <summary>Response Headers</summary>
    <Copyable text={responseHeaders}>
      <pre class="json-viewer">{responseHeaders}</pre>
    </Copyable>
  </details>

  <details class="section" open>
    <summary>Response Body</summary>
    <Body body={request.response.body} />
  </details>
{/if}
