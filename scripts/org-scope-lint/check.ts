// Holds raw SQL to the organization scope (`@protobase/query`), which sees only what reaches Kysely as operation
// nodes: refuses SQL text that names a table whose rows belong to one organization, by its default or configured name,
// outside `scoped()` and `unscoped()`, and `withoutPlugins()` outside the files that must drop the scope's plugin; and
// holds each file's `unscoped(` uses to the reviewed list, unscoped-uses.json, so a new one is seen in review.
//
//   bun scripts/org-scope-lint/check.ts
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { countUnscoped, unlistedCounts, type UnscopedCounts } from './count-unscoped'
import { findRawTables } from './find-raw-tables'
import { scopedNames } from './scoped-names'
import { sourceFiles } from './source-files'

// The files that drop query plugins: the scope itself, which rebuilds the plugin chain around its own, and the store's
// plain database, which leaves the scope by name first (`withoutAppPlugins`).
const dropPlugins = new Set(['packages/query/src/table-scope/scoped-db.ts', 'packages/server/src/better-auth/store/store-db.ts'])

const root = path.join(import.meta.dirname, '../..')
const listPath = path.join(import.meta.dirname, 'unscoped-uses.json')
const files = sourceFiles(root).filter((file) => existsSync(path.join(root, file)))
const names = scopedNames(files.filter((file) => path.basename(file) === 'protobase.config.ts').map((file) => path.join(root, file)))

const findings = files.flatMap((file) => findRawTables(path.join(root, file), names, dropPlugins.has(file)).map((finding) => ({ ...finding, file })))
for (const { file, line, what } of findings) console.error(`${file}:${line}: ${what}`)

const found = Object.fromEntries(files.map((file) => [file, countUnscoped(path.join(root, file))]).filter(([, count]) => count !== 0))
const unlisted = unlistedCounts(found, JSON.parse(readFileSync(listPath, 'utf8')) as UnscopedCounts)
for (const line of unlisted) console.error(`${line} (${path.relative(root, listPath)})`)

if (findings.length > 0 || unlisted.length > 0) process.exit(1)
