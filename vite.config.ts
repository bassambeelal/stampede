import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Served from https://<user>.github.io/<repo>/, so assets need the repo prefix.
// `BASE_PATH` lets CI override it without editing this file.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022' },
  test: {
    // The engine under test is pure TypeScript with no DOM dependency.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
