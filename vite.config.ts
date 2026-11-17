import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  root: 'playground',
  base: command === 'build' ? './' : '/fluid-prism/',
  build: {
    outDir: '../dist-playground',
    emptyOutDir: true,
  },
}));
