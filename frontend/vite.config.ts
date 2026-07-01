import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/v1':  'http://localhost:8080',
      '/docs': 'http://localhost:8080',
      '/redoc': 'http://localhost:8080',
      '/openapi.json': 'http://localhost:8080',
    },
  },
})
