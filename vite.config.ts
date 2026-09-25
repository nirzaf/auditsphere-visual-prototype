import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split the bundle so no single emitted chunk crosses the 500 kB budget,
        // while keeping every import static so runtime view rendering stays
        // synchronous (no Suspense boundaries). Each module view, the heavyweight
        // document libraries, and the large static datasets become their own
        // cacheable chunk.
        manualChunks: (id) => {
          const path = id.replace(/\\/g, '/');
          // Each route/module view is its own chunk (still eagerly loaded).
          const viewMatch = path.match(/\/src\/components\/modules\/([A-Za-z0-9_]+)\.tsx$/);
          if (viewMatch) return `view-${viewMatch[1]}`;
          // Large static datasets that change independently of application logic.
          if (path.includes('/src/store/initialState')) return 'app-seed-data';
          if (path.includes('/src/services/moduleGuideContent')) return 'module-guide-content';
          if (!id.includes('node_modules')) return;
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(path)) return 'vendor-react';
          if (/[\\/]xlsx[\\/]/.test(path)) return 'vendor-xlsx';
          if (/[\\/]docx[\\/]/.test(path)) return 'vendor-docx';
          if (/[\\/]jspdf[\\/]/.test(path)) return 'vendor-jspdf';
        },
      },
    },
  },
});
