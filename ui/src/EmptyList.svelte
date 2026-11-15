<script lang="ts">
// What the list says when it shows no calls. While searching, it names the
// other projects that have matches, with a button to open each.
let {
	project,
	search,
	failedOnly,
	elsewhere,
	onchoose,
}: {
	project: string;
	search: string;
	/** Whether only failed calls are shown. */
	failedOnly: boolean;
	/** Each other project with matches, and how many. */
	elsewhere: [string, number][];
	onchoose: (project: string) => void;
} = $props();
</script>

<div class="no-requests">
  {#if failedOnly && !search}
    No failed calls in {project}.
  {:else if !search}
    No requests captured yet. Point an app at LLMSpy, e.g. ANTHROPIC_BASE_URL=http://127.0.0.1:8080/anthropic
  {:else if elsewhere.length === 0}
    No requests match your search
  {:else}
    No matches in {project}. Found in:
    <span class="found-in">
      {#each elsewhere as [name, count] (name)}
        <button type="button" class="small-btn" onclick={() => onchoose(name)}>
          {name} ({count})
        </button>
      {/each}
    </span>
  {/if}
</div>
