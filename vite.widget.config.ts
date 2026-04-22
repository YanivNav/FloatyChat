import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJs from 'vite-plugin-css-injected-by-js';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), cssInjectedByJs()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'widget/entry.ts'),
      formats: ['es'],
      fileName: () => 'widget.js',
    },
    outDir: 'src/extensions/site/embedded-scripts/chat-script',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
});
