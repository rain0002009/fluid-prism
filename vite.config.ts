import { defineConfig } from 'vite';

export default defineConfig({
  root: 'playground',
  base: '/fluid-prism/',
  build: {
    outDir: '../dist-playground',
    emptyOutDir: true,
  },
});
