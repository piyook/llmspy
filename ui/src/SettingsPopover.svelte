<script lang="ts">
import { loadTheme, setTheme, THEMES, type Theme } from './lib/theme';
import Popover from './Popover.svelte';

let theme = $state<Theme>(loadTheme());
</script>

<Popover id="settings-popover" label="Settings" buttonClass="icon-btn" buttonLabel="Settings">
  {#snippet trigger()}
    <!-- A cog: a ring with eight teeth around it. -->
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="6.5" stroke-width="2" />
      <circle cx="12" cy="12" r="2.5" stroke-width="2" />
      <path
        stroke-width="3"
        d="M19 12h3M12 19v3M5 12H2M12 5V2M16.95 16.95l2.12 2.12M7.05 16.95l-2.12 2.12M7.05 7.05 4.93 4.93M16.95 7.05l2.12-2.12"
      />
    </svg>
  {/snippet}

  <fieldset class="setting">
    <legend>Theme</legend>
    <div class="setting-options">
      {#each THEMES as option (option.value)}
        <label>
          <input
            type="radio"
            name="theme"
            value={option.value}
            bind:group={theme}
            onchange={() => setTheme(theme)}
          />
          {option.label}
        </label>
      {/each}
    </div>
  </fieldset>
</Popover>
