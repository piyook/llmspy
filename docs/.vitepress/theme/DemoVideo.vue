<script setup lang="ts">
import { withBase } from 'vitepress';
import { onMounted, ref } from 'vue';

const video = ref<HTMLVideoElement>();
const reducedMotion = ref(false);

// Respect "reduce motion": show the poster with controls instead of autoplaying.
onMounted(() => {
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		reducedMotion.value = true;
		video.value?.pause();
	}
});
</script>

<template>
	<div class="demo-video">
		<video
			ref="video"
			:src="withBase('/videos/llmspy-demo.webm')"
			:poster="withBase('/videos/llmspy-demo.jpg')"
			:autoplay="!reducedMotion"
			:controls="reducedMotion"
			muted
			loop
			playsinline
			preload="auto"
			width="1920"
			height="1080"
			aria-label="LLMSpy demo: a small agent's calls show up live in LLMSpy as a conversation with its tool call, are compared with the call before, and a failed call shows its 429 reply"
		></video>
	</div>
</template>

<style scoped>
.demo-video {
	margin: 16px 0;
	width: 100%;
	border-radius: 12px;
	overflow: hidden;
	box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
	aspect-ratio: 16 / 9;
	background: #121220;
}

.demo-video video {
	display: block;
	width: 100%;
	height: 100%;
}
</style>
