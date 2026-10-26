import { defineConfig } from 'tsdown'

// dev/entry.ts, dev/api-support.ts and serve/main.ts are not imported: Vite loads them by path (see dev/api-process.ts and
// build/serve-runtime.ts), and dev/api-process.ts runs in a process of its own (see dev/api-child.ts). As entries they
// keep every export.
export default defineConfig({
  entry: ['src/index.ts', 'src/runner.ts', 'src/dev/entry.ts', 'src/dev/api-support.ts', 'src/dev/api-process.ts', 'src/serve/main.ts'],
  unbundle: true,
  fixedExtension: false,
  dts: true,
})
