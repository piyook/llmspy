<script lang="ts">
let {
	projects,
	current,
	unseen,
	onchoose,
}: {
	/** `general` first; the strip is left out while it is the only one. */
	projects: string[];
	current: string;
	/** New calls since each project was last viewed. */
	unseen: (project: string) => number;
	onchoose: (project: string) => void;
} = $props();
</script>

{#if projects.length > 1}
  <div class="tabs project-tabs" role="group" aria-label="Project">
    {#each projects as project (project)}
      {@const count = project === current ? 0 : unseen(project)}
      <button
        type="button"
        class="tab"
        class:active={project === current}
        aria-pressed={project === current}
        onclick={() => onchoose(project)}
      >
        {project}
        {#if count > 0}
          <span class="tab-badge" aria-label="{count} new">{count}</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}
