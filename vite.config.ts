import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Production builds are served from GitHub Pages at /arknova-analytics/.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/arknova-analytics/' : '/',
}))
