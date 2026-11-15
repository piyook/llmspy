<script lang="ts">
import Copyable from './Copyable.svelte';
import { formatBody } from './lib/format.js';

let { body }: { body: string } = $props();

const text = $derived(body ? formatBody(body) : 'No body');
</script>

<Copyable {text}>
  <pre class="json-viewer">{text}</pre>
</Copyable>
