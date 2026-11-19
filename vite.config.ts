import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 9878,
    allowedHosts: ['silentlayer.dpdns.org'],
  },
  preview: {
    port: 9878,
    allowedHosts: ['silentlayer.dpdns.org'],
  },
});
