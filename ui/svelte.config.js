import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess({
    typescript: true
  }),
  compilerOptions: {
    compatibility: {
      componentApi: 4
    }
  }
};
