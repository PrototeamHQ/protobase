// Holds the built-in workflow plugins to sending only through their context's `fetch`, which checks the address it
// connects to: it refuses a global that sends (`fetch`, `WebSocket`, ...), the global object, `require` and `import()`
// in packages/workflow-plugins/src. The network modules and HTTP clients are refused by the dependency rules.
//
//   bun scripts/plugin-network/check.ts
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { findNetworkUses } from './find-network'

const root = path.join(import.meta.dirname, '../../packages/workflow-plugins/src')
const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
  .filter((name) => /\.[mc]?tsx?$/.test(name) && !/\.(test|d)\.[mc]?tsx?$/.test(name))
  .map((name) => path.join(root, name))
const uses = findNetworkUses(files)
for (const use of uses) console.error(`${path.relative(process.cwd(), use.file)}:${use.line}: ${use.what} is a way out besides the plugin context's fetch`)
if (uses.length > 0) process.exit(1)
