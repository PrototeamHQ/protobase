import type { AfterIndex } from '@protobase/server/internal'

// A migration's `.after.sql`: statements that cannot run in a transaction, such as `create index concurrently`, which
// `migrate` runs one at a time once the migration's transaction commits, then marks the migration complete.

/** The `.after.sql` beside the migration `file`. */
export const afterFileOf = (file: string) => file.replace(/\.sql$/, '.after.sql')

export const isAfterFile = (file: string) => file.endsWith('.after.sql')

/** Its statements: each ends with a semicolon at the end of a line. Comment lines between them are dropped. */
export const afterStatements = (text: string) =>
  text
    .replaceAll('\r\n', '\n')
    .split(/;[ \t]*(?:\n|$)/)
    .map((statement) => statement.split('\n').filter((line) => !/^\s*--/.test(line)).join('\n').trim())
    .filter((statement) => statement !== '')

const createIndex = /^create\s+(unique\s+)?index\s+concurrently\s+(?:if\s+not\s+exists\s+)?("(?:[^"]|"")+"|[A-Za-z_][\w$]*)/i

/** The index a statement builds concurrently, as Postgres names it; `undefined` for any other statement. */
export const builtIndex = (statement: string): AfterIndex | undefined => {
  const found = createIndex.exec(statement)
  if (!found) return
  const name = found[2]!
  return { index: name.startsWith('"') ? name.slice(1, -1).replaceAll('""', '"') : name.toLowerCase(), unique: Boolean(found[1]) }
}
