#!/usr/bin/env node
// Runs the TypeScript CLI straight from source. Node 22.16 does not strip types by default and the
// sources use extensionless imports, so tsx is registered first.
import { register } from 'tsx/esm/api'

register()
const { run } = await import('../src/index.ts')
await run(process.argv)
