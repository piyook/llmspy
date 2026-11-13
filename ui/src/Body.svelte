<script lang="ts">
import { formatBody } from './lib/format.js';

let { body }: { body: string } = $props();

const text = $derived(body ? formatBody(body) : 'No body');
</script>

<pre class="json-viewer">{text}</pre>
