// Holds raw SQL to the organization scope (`@protobase/query`), which sees only what reaches Kysely as operation
// nodes: refuses SQL text that names a table whose rows belong to one organization, by its default or configured name,
// outside `scoped()` and `unscoped()`, and `withoutPlugins()` outside the files that must drop the scope's plugin; and
// holds each file's calls of the scope's opt-outs, `unscoped(`, `acrossOrganizations(` and `everyOrganization(`, to the
// reviewed list, opt-out-uses.json, so a new one is seen in review.
//
//   bun scripts/org-scope-lint/check.ts
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { countOptOuts, unlistedCounts, type OptOutCounts } from './count-opt-outs'
import { findRawTables } from './find-raw-tables'
import { scopedNames } from './scoped-names'
import { sourceFiles } from './source-files'

// The files that drop query plugins: the scope itself, which rebuilds the plugin chain around its own, and the store's
// plain database, which leaves the scope by name first (`withoutAppPlugins`).
const dropPlugins = new Set(['packages/query/src/table-scope/scoped-db.ts', 'packages/server/src/better-auth/store/store-db.ts'])

const root = path.join(import.meta.dirname, '../..')
const listPath = path.join(import.meta.dirname, 'opt-out-uses.json')
const files = sourceFiles(root).filter((file) => existsSync(path.join(root, file)))
const names = scopedNames(files.filter((file) => path.basename(file) === 'protobase.config.ts').map((file) => path.join(root, file)))

const findings = files.flatMap((file) => findRawTables(path.join(root, file), names, dropPlugins.has(file)).map((finding) => ({ ...finding, file })))
for (const { file, line, what } of findings) console.error(`${file}:${line}: ${what}`)

const found: OptOutCounts = Object.fromEntries(files.map((file) => [file, countOptOuts(path.join(root, file))] as const).filter(([, counts]) => Object.keys(counts).length > 0))
const unlisted = unlistedCounts(found, JSON.parse(readFileSync(listPath, 'utf8')) as OptOutCounts)
for (const line of unlisted) console.error(`${line} (${path.relative(root, listPath)})`)

if (findings.length > 0 || unlisted.length > 0) process.exit(1)
