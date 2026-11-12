import { defineConfig } from 'tsdown'

// Every module is an entry, so the lazy viewer stays a module of its own and the app's build splits it into a chunk
// that loads only when an image opens. Stories, tests and their fixtures are left out.
export default defineConfig({
  entry: ['src/**/*.{ts,tsx}', '!src/**/*.{test,stories}.{ts,tsx}', '!src/testing/**'],
  unbundle: true,
  fixedExtension: false,
  platform: 'neutral',
  dts: true,
})
