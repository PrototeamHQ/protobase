#!/usr/bin/env node
// The CLI from source, for this repository: the sources use extensionless imports, so tsx is registered first. The
// published package's bin is protobase.mjs, which runs the build in dist.
import { register } from 'tsx/esm/api'

register()
const { run } = await import('../src/index.ts')
await run(process.argv)
