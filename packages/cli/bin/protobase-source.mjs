#!/usr/bin/env node
// The CLI from source, for this repository: the sources use extensionless imports, which Bun loads itself and Node
// through tsx. The published package's bin is protobase.mjs, which runs the build in dist. Both hand a locked project
// over to its own CLI (src/hand-over.ts).
import { fileURLToPath } from 'node:url'

if (!process.versions.bun) {
  const { register } = await import('tsx/esm/api')
  register()
}
const { runHandingOver } = await import('../src/hand-over.ts')
await runHandingOver(fileURLToPath(new URL('..', import.meta.url)), async () => (await import('../src/index.ts')).run, process.argv)
