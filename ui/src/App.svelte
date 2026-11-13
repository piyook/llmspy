<script lang="ts">
import { onMount } from 'svelte';

interface InterceptedRequest {
	id: string;
	timestamp: string;
	host: string;
	method: string;
	path: string;
	headers: Record<string, string>;
	body: string;
	response?: {
		status: number;
		headers: Record<string, string>;
		body: string;
	};
	latency?: number;
	error?: string;
}

let requests: InterceptedRequest[] = [];
let searchTerm = '';
let expandedRequests: Set<string> = new Set();
let eventSource: EventSource | null = null;

onMount(() => {
	// Load initial requests
	fetch('http://localhost:8080/api/requests')
		.then((res) => res.json())
		.then((data) => {
			requests = data;
		})
		.catch((err) => {
			console.error('Failed to load initial requests:', err);
		});

	// Setup SSE connection
	eventSource = new EventSource('http://localhost:8080/events');

	eventSource.onmessage = (event) => {
		const newRequest: InterceptedRequest = JSON.parse(event.data);
		requests = [newRequest, ...requests];
	};

	eventSource.onerror = (error) => {
		console.error('SSE error:', error);
		// Retry connection after 5 seconds
		setTimeout(() => {
			if (eventSource) {
				eventSource.close();
			}
			eventSource = new EventSource('http://localhost:8080/events');
		}, 5000);
	};

	return () => {
		if (eventSource) {
			eventSource.close();
		}
	};
});

function filteredRequests(): InterceptedRequest[] {
	if (!searchTerm) return requests;

	const term = searchTerm.toLowerCase();
	return requests.filter(
		(req) =>
			req.host.toLowerCase().includes(term) ||
			req.path.toLowerCase().includes(term) ||
			req.body.toLowerCase().includes(term) ||
			req.response?.body?.toLowerCase().includes(term),
	);
}

function toggleExpanded(id: string) {
	if (expandedRequests.has(id)) {
		expandedRequests.delete(id);
	} else {
		expandedRequests.add(id);
	}
	expandedRequests = new Set(expandedRequests);
}

async function clearRequests() {
	try {
		await fetch('http://localhost:8080/api/clear', { method: 'POST' });
		requests = [];
	} catch (err) {
		console.error('Failed to clear requests:', err);
	}
}

function formatTimestamp(timestamp: string): string {
	return new Date(timestamp).toLocaleTimeString();
}

function formatLatency(latency?: number): string {
	if (!latency) return '';
	return latency < 1000 ? `${latency}ms` : `${(latency / 1000).toFixed(2)}s`;
}

function formatJson(obj: unknown): string {
	return JSON.stringify(obj, null, 2);
}

function getStatusClass(status?: number): string {
	if (!status) return '';
	return status >= 200 && status < 300 ? 'status-success' : 'status-error';
}
</script>

<div class="header">
  <h1>LLMSpy</h1>
  <div class="controls">
    <input 
      type="text" 
      placeholder="Search requests..." 
      class="search"
      bind:value={searchTerm}
    />
    <button class="clear-btn" on:click={clearRequests}>
      Clear All
    </button>
  </div>
</div>

<div class="requests">
  {#each filteredRequests() as request (request.id)}
    <div class="request-item" on:click={() => toggleExpanded(request.id)}>
      <div class="request-header">
        <div class="request-host">{request.host}</div>
        <div class="request-time">{formatTimestamp(request.timestamp)}</div>
      </div>
      
      <div class="request-details">
        <div class="request-detail">
          <span class="request-detail-label">Method</span>
          <span class="request-detail-value">{request.method}</span>
        </div>
        <div class="request-detail">
          <span class="request-detail-label">Path</span>
          <span class="request-detail-value">{request.path}</span>
        </div>
        {#if request.response}
          <div class="request-detail">
            <span class="request-detail-label">Status</span>
            <span class="request-detail-value {getStatusClass(request.response.status)}">
              {request.response.status}
            </span>
          </div>
        {/if}
        {#if request.latency}
          <div class="request-detail">
            <span class="request-detail-label">Latency</span>
            <span class="request-detail-value latency">{formatLatency(request.latency)}</span>
          </div>
        {/if}
        {#if request.error}
          <div class="request-detail">
            <span class="request-detail-label">Error</span>
            <span class="request-detail-value status-error">{request.error}</span>
          </div>
        {/if}
      </div>

      {#if expandedRequests.has(request.id)}
        <div class="expanded-content">
          <h3>Request Headers</h3>
          <div class="json-viewer">{formatJson(request.headers)}</div>
          
          <h3>Request Body</h3>
          <div class="json-viewer">
            {request.body ? formatJson(JSON.parse(request.body || '{}')) : 'No body'}
          </div>
          
          {#if request.response}
            <h3>Response Headers</h3>
            <div class="json-viewer">{formatJson(request.response.headers)}</div>
            
            <h3>Response Body</h3>
            <div class="json-viewer">
              {request.response.body ? formatJson(JSON.parse(request.response.body || '{}')) : 'No body'}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}

  {#if filteredRequests().length === 0}
    <div class="no-requests">
      {searchTerm ? 'No requests match your search' : 'No requests intercepted yet. Make sure your HTTP_PROXY/HTTPS_PROXY are set to localhost:8080'}
    </div>
  {/if}
</div>

<style>
  /* Styles are imported from app.css */
</style>
