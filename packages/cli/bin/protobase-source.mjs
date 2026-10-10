#!/usr/bin/env node
// The CLI from source, for this repository: the sources use extensionless imports, which Bun loads itself and Node
// through tsx. The published package's bin is protobase.mjs, which runs the build in dist.
if (!process.versions.bun) {
  const { register } = await import('tsx/esm/api')
  register()
}
const { run } = await import('../src/index.ts')
await run(process.argv)
