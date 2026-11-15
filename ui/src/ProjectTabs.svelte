<script lang="ts">
import { tabBadge } from './lib/projects.js';

let {
	projects,
	current,
	unseen,
	matches,
	onchoose,
}: {
	/** `general` first; the strip is left out while it is the only one. */
	projects: string[];
	current: string;
	/** New calls since each project was last viewed. */
	unseen: (project: string) => number;
	/**
	 * While searching, each project's number of matches; the badges show
	 * these instead of new calls.
	 */
	matches?: Map<string, number>;
	onchoose: (project: string) => void;
} = $props();

const badge = (project: string) => tabBadge(project, current, unseen, matches);
</script>

{#if projects.length > 1}
  <div class="tabs project-tabs" role="group" aria-label="Project">
    {#each projects as project (project)}
      {@const { count, match, label } = badge(project)}
      <button
        type="button"
        class="tab"
        class:active={project === current}
        class:no-match={match && count === 0 && project !== current}
        aria-pressed={project === current}
        onclick={() => onchoose(project)}
      >
        {project}
        {#if count > 0}
          <span class="tab-badge" class:match-badge={match} aria-label="{count} {label}">{count}</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}
