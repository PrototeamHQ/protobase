import type { AfterIndex } from '@protobase/server/internal'

// A migration's `.after.sql`: statements that cannot run in a transaction, such as `create index concurrently`, which
// `migrate` runs one at a time once the migration's transaction commits, then marks the migration complete.

/** The `.after.sql` beside the migration `file`. */
export const afterFileOf = (file: string) => file.replace(/\.sql$/, '.after.sql')

export const isAfterFile = (file: string) => file.endsWith('.after.sql')

// A dollar quote's tag, such as `$fill$` or `$$`, which opens a body until the same tag closes it.
const dollarTag = /\$(?:[A-Za-z_][\w]*)?\$/g

/**
 * Its statements: each ends with a semicolon at the end of a line outside a dollar-quoted body, so a `do` block whose
 * own statements end lines is one statement. Comment lines between them are dropped.
 */
export const afterStatements = (text: string) => {
  const statements: string[] = []
  let lines: string[] = []
  let open: string | undefined
  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    if (open === undefined && /^\s*--/.test(line)) continue
    for (const [tag] of line.matchAll(dollarTag)) open = open === undefined ? tag : open === tag ? undefined : open
    lines.push(line)
    if (open !== undefined || !/;[ \t]*$/.test(line)) continue
    statements.push(lines.join('\n').replace(/;[ \t]*$/, ''))
    lines = []
  }
  statements.push(lines.join('\n'))
  return statements.map((statement) => statement.trim()).filter((statement) => statement !== '')
}

const identifier = '(?:"(?:[^"]|"")+"|[A-Za-z_][\\w$]*)'
const createIndex = new RegExp(`^create\\s+(unique\\s+)?index\\s+concurrently\\s+(?:if\\s+not\\s+exists\\s+)?(${identifier})\\s+on\\s+(?:only\\s+)?(${identifier}(?:\\.${identifier})?)`, 'i')

/** The index a statement builds concurrently, as Postgres names it; `undefined` for any other statement. */
export const builtIndex = (statement: string): AfterIndex | undefined => {
  const found = createIndex.exec(statement)
  if (!found) return
  const name = found[2]!
  return { index: name.startsWith('"') ? name.slice(1, -1).replaceAll('""', '"') : name.toLowerCase(), unique: Boolean(found[1]) }
}

/** The table a statement builds an index on concurrently, as the statement names it; `undefined` for any other statement. */
export const indexedTable = (statement: string) => createIndex.exec(statement)?.[3]
