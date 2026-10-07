import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// `vite build --mode pages` (npm run build:pages) produces the static browser-only demo for GitHub Pages:
// VITE_DEMO=true swaps the API layer for the in-browser demo backend, and the base path is the repo subpath.
// Any other build is the normal full-stack client and contains none of the demo code.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const pages = mode === 'pages'
  const demo = pages || env.VITE_DEMO === 'true'
  return {
    base: env.VITE_BASE || (pages ? '/Bookstore-Ecommerce-App/' : '/'),
    plugins: [react()],
    define: { 'import.meta.env.VITE_DEMO': JSON.stringify(demo ? 'true' : 'false') },
  }
})
