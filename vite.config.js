import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // relative paths so the site works from any sub-path on a static host
  test: { environment: 'jsdom' },
});
