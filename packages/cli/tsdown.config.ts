import { defineConfig } from 'tsdown'

// dev/entry.ts and serve/main.ts are not imported: Vite loads them by path (see dev/run.ts and build/serve-runtime.ts).
export default defineConfig({
  entry: ['src/index.ts', 'src/dev/entry.ts', 'src/serve/main.ts'],
  unbundle: true,
  fixedExtension: false,
  dts: true,
})
