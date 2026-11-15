import { defineConfig } from 'tsdown'

// Every module is an entry, so the lazy drawing stays a module of its own and the app's build splits it into a chunk
// that loads only when a graph draws, and the layout entry carries none of it. Stories, tests and their fixtures are left out.
export default defineConfig({
  entry: ['src/**/*.{ts,tsx}', '!src/**/*.{test,stories}.{ts,tsx}', '!src/**/*.d.ts', '!src/testing/**'],
  // Its stylesheet's `?inline` import is the app's Vite build's to resolve.
  deps: { neverBundle: [/^@xyflow\/react/] },
  unbundle: true,
  fixedExtension: false,
  platform: 'neutral',
  dts: true,
})
