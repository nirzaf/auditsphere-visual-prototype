import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // Keep the existing Cloudflare Pages artifact in dist/ untouched while
    // the React migration is verified independently.
    outDir: 'dist-vite',
    emptyOutDir: true,
    sourcemap: true,
  },
});
