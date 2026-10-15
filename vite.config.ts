import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

export default defineConfig(() => ({
  plugins: [react()],
  // App-Version und Build-Datum für Bericht und Fusszeile
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATUM__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  // Eigene Domain (fgscheck.ch) → die Site liegt an der Wurzel, nicht unter /<repo>/.
  base: '/',
  // Dev-Server: zugewiesenen Port aus der Umgebung respektieren (z. B. Preview-Tooling).
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
  // Verhindert, dass esbuild Media-Queries in die Level-4-Range-Syntax umschreibt
  // (erst ab iOS 16.4 / Safari 16.4 unterstützt).
  build: {
    cssTarget: ['chrome80', 'safari13', 'firefox78', 'edge80'],
  },
}))
