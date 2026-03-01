import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@vendor': path.resolve(__dirname, 'vendor')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
