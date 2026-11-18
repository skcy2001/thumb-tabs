import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'

export default defineConfig({
  plugins: [react()],
  // Settings > About shows it (src/about.ts).
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { dedupe: ['react', 'react-dom'] },
  base: './',
  clearScreen: false,
  server: { watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2020' },
})
