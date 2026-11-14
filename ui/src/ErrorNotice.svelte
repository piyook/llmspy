<script lang="ts">
// title: what went wrong. detail: the error's own text, if any.
// hint: whether any of the reply came before the error.
let { title, detail, hint }: { title: string; detail?: string; hint: string } =
	$props();
</script>

<p class="notice error-notice" role="alert">
  <strong>{title}</strong>
  {#if detail}<span>{detail}</span>{/if}
  <span class="error-hint">{hint}</span>
</p>
