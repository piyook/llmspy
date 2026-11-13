<script lang="ts">
import Body from './Body.svelte';
import { formatLatency, formatTime, statusClass } from './lib/format.js';
import type { CapturedRequest } from './lib/types.js';

let { request }: { request: CapturedRequest } = $props();

let expanded = $state(false);
</script>

<div class="request-item">
  <button
    type="button"
    class="request-summary"
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    <span class="request-header">
      <span class="request-host">{request.host}</span>
      <span class="request-time">{formatTime(request.timestamp)}</span>
    </span>

    <span class="request-details">
      <span class="request-detail">
        <span class="request-detail-label">Method</span>
        <span class="request-detail-value">{request.method}</span>
      </span>
      <span class="request-detail">
        <span class="request-detail-label">Path</span>
        <span class="request-detail-value">{request.path}</span>
      </span>
      {#if request.response}
        <span class="request-detail">
          <span class="request-detail-label">Status</span>
          <span class="request-detail-value {statusClass(request.response.status)}">
            {request.response.status}
          </span>
        </span>
      {/if}
      {#if request.latency !== undefined}
        <span class="request-detail">
          <span class="request-detail-label">Latency</span>
          <span class="request-detail-value latency">{formatLatency(request.latency)}</span>
        </span>
      {/if}
      {#if request.error}
        <span class="request-detail">
          <span class="request-detail-label">Error</span>
          <span class="request-detail-value status-error">{request.error}</span>
        </span>
      {/if}
    </span>
  </button>

  {#if expanded}
    <div class="expanded-content">
      <h3>Request Headers</h3>
      <pre class="json-viewer">{JSON.stringify(request.headers, null, 2)}</pre>

      <h3>Request Body</h3>
      <Body body={request.body} />

      {#if request.response}
        <h3>Response Headers</h3>
        <pre class="json-viewer">{JSON.stringify(request.response.headers, null, 2)}</pre>

        <h3>Response Body</h3>
        <Body body={request.response.body} />
      {/if}
    </div>
  {/if}
</div>
