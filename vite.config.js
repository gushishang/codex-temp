import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: ['pvz5g4-5173.csb.app'],
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: ['pvz5g4-5173.csb.app'],
  },
});
