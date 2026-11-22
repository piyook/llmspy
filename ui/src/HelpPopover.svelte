<script lang="ts">
import Popover from './Popover.svelte';

const DOCS_URL = 'https://llmspy.piyook.com/';
// What LLMSpy listens on unless PROXY_PORT says otherwise; shown until the UI reaches the proxy.
const DEFAULT_ADDRESS = '127.0.0.1:8080';

let { address }: { address?: string } = $props();

const base = $derived(`${location.protocol}//${address ?? DEFAULT_ADDRESS}`);
</script>

<Popover id="help-popover" label="Help" buttonClass="icon-btn" buttonLabel="Help">
  {#snippet trigger()}
    <!-- A question mark in a circle. -->
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.25 9.5a2.75 2.75 0 1 1 3.9 2.5c-.7.33-1.15 1-1.15 1.8v.45" />
      <path d="M12 17.25h.01" stroke-width="2.5" />
    </svg>
  {/snippet}

  <div class="help">
    <h2>Quickstart</h2>
    <ol>
      <li>
        Point your app's base URL at LLMSpy, for example:
        <code class="help-code">ANTHROPIC_BASE_URL={base}/anthropic</code>
        <code class="help-code">OPENAI_BASE_URL={base}/openai/v1</code>
        Base URLs lists every upstream.
      </li>
      <li>Run your app as usual. Its calls go through LLMSpy unchanged.</li>
      <li>
        Each call appears on the left as soon as it is sent, and is filled in
        when the reply ends. Pick one to see it as a conversation, or the raw
        request and response.
      </li>
    </ol>

    <h2>Good to know</h2>
    <ul>
      <li>
        Add other upstreams when starting LLMSpy:
        <code>LLMSPY_UPSTREAMS=name=url,...</code>
      </li>
      <li>
        Group an app's calls in their own tab by putting
        <code>/@project</code> in front of the prefix:
        <code class="help-code">ANTHROPIC_BASE_URL={base}/@my-app/anthropic</code>
        Calls without it go to <code>general</code>.
      </li>
      <li>
        Search looks in every project, prompts and replies included; each tab
        shows its number of matches.
      </li>
      <li>
        The chips under Today show only the calls of the last 5 to 90
        minutes.
      </li>
      <li>
        The red Failed chip shows only the calls that went wrong: an error,
        a status of 400 or above, or an error inside the reply.
      </li>
      <li>
        The cards at the top count the calls in the list: how many, how many
        failed, their tokens and their latency.
      </li>
      <li>
        Coding agents and scripts can read the captured calls too; point them
        at the reference:
        <code class="help-code">{base}/llms.txt</code>
      </li>
      <li>
        Export saves the calls in the list as an llm-capture file, for other
        tools or to keep. API keys are left out; prompts and replies are not.
      </li>
      <li>API keys are masked. Prompts and replies are shown in full.</li>
      <li>
        Calls are kept in a file on your machine, so they survive a restart:
        the last 7 days unless <code>LLMSPY_RETENTION_DAYS</code> says
        otherwise. Clear All empties the project you are viewing.
      </li>
    </ul>

    <p class="help-more">
      More in the <a href={DOCS_URL} target="_blank" rel="noreferrer">docs</a>.
    </p>
  </div>
</Popover>
