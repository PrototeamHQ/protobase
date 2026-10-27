import { defineConfig } from 'tsdown'

// dev/entry.ts, dev/api-support.ts and serve/main.ts are not imported: Vite loads them by path (see dev/api-process.ts and
// build/serve-runtime.ts), dev/api-process.ts runs in a process of its own (see dev/api-child.ts), Bun preloads
// run/preload.ts into a script (see run/run-script.ts) and bin/protobase.mjs imports hand-over.ts. As entries they keep
// every export.
export default defineConfig({
  entry: ['src/index.ts', 'src/runner.ts', 'src/project-auth.ts', 'src/scaffold-api.ts', 'src/dev/entry.ts', 'src/dev/api-support.ts', 'src/dev/api-process.ts', 'src/serve/main.ts', 'src/run/preload.ts', 'src/hand-over.ts'],
  unbundle: true,
  fixedExtension: false,
  dts: true,
})
