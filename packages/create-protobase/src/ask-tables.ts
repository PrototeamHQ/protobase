/**
 * A table the project's `protobase scaffold` can write a resource over, with its number of columns and the tables among
 * them its foreign keys point to, as schema.table.
 */
export type DatabaseTable = { schema: string; name: string; columns: number; references: string[] }

const keyOf = (table: DatabaseTable) => `${table.schema}.${table.name}`

// The tables one part of an answer names: a number, a range of numbers, schema.table, or a name only one table has.
const tablesForPart = (keys: string[], part: string) => {
  const range = /^(\d+)(?:-(\d+))?$/.exec(part)
  if (range) {
    const from = Number(range[1])
    const to = Number(range[2] ?? range[1])
    if (from < 1 || to > keys.length || from > to) return undefined
    return keys.slice(from - 1, to)
  }
  if (keys.includes(part)) return [part]
  const named = keys.filter((key) => key.endsWith(`.${part}`))
  return named.length === 1 ? named : undefined
}

/**
 * The keys of the tables an answer picks from `keys`, in their order: every one for an empty answer or `all`, otherwise
 * those its comma-separated numbers, ranges such as 2-4, schema.table names and table names name; nothing for an answer
 * with a part that names none.
 */
export const tablesForAnswer = (keys: string[], answer: string) => {
  const text = answer.trim()
  if (text === '' || text === 'all') return keys
  const picked = new Set<string>()
  for (const part of text.split(',').map((each) => each.trim()).filter(Boolean)) {
    const tables = tablesForPart(keys, part)
    if (!tables) return undefined
    for (const key of tables) picked.add(key)
  }
  return keys.filter((key) => picked.has(key))
}

/**
 * The keys of `picked` and of every table they point to, directly or through others, in the order of `tables`: a
 * relation names the resource of the table it points to, and the app refuses one whose resource is missing.
 */
export const withReferenced = (tables: DatabaseTable[], picked: string[]) => {
  const byKey = new Map(tables.map((table) => [keyOf(table), table]))
  const found = new Set<string>()
  const visit = (key: string) => {
    if (found.has(key)) return
    found.add(key)
    for (const referenced of byKey.get(key)?.references ?? []) visit(referenced)
  }
  for (const key of picked) visit(key)
  return tables.map(keyOf).filter((key) => found.has(key))
}

/** The numbered list of `tables` the question picks from, and what scaffold leaves out with why. */
export const tableMenu = (database: string, tables: DatabaseTable[], skipped: string[]) => {
  const width = Math.max(...tables.map((table) => keyOf(table).length))
  const lines = tables.map((table, i) => `  ${String(i + 1).padStart(String(tables.length).length)}. ${keyOf(table).padEnd(width)}  ${table.columns} column${table.columns === 1 ? '' : 's'}\n`)
  const left = skipped.length === 0 ? '' : `Left out:\n${skipped.map((line) => `  ${line}\n`).join('')}`
  return `\nTables in ${database}:\n${lines.join('')}${left}`
}

/** Asks with `question`, a terminal prompt's, which of `tables` become resources, again until the answer names them. */
export const askTables = async (tables: DatabaseTable[], question: (text: string) => Promise<string>, print: (text: string) => void) => {
  const keys = tables.map(keyOf)
  for (;;) {
    const picked = tablesForAnswer(keys, await question('Which tables become resources? Numbers, ranges or names, such as 1,3-5 [all]: '))
    if (picked) return picked
    print(`  pick numbers from 1 to ${keys.length}, ranges of them or table names, separated by commas\n`)
  }
}
