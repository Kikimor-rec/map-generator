import react from '@vitejs/plugin-react'
import path from 'path'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@ui': path.resolve(__dirname, './src/ui'),
      '@generators': path.resolve(__dirname, './src/generators'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@store': path.resolve(__dirname, './src/store'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  test: {
    exclude: [...configDefaults.exclude, 'scripts/__tests__/**'],
  },
})
