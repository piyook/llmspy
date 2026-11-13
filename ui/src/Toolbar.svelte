<script lang="ts">
let {
	search = $bindable(''),
	onclear,
}: { search: string; onclear: () => void } = $props();
</script>

<div class="header">
  <h1>LLMSpy</h1>
  <div class="controls">
    <input
      type="search"
      placeholder="Search requests..."
      aria-label="Search requests"
      class="search"
      bind:value={search}
    />
    <button type="button" class="clear-btn" onclick={onclear}>Clear All</button>
  </div>
</div>
