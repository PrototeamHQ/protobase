/** A table whose rows belong to one organization, as SQL text names it: its schema and its name. */
export type ScopedName = { schema: string; table: string }

// The keywords a table name follows in a statement, where a bare name is a table rather than a column.
const tableKeywords = new Set(['from', 'join', 'update', 'into', 'table', 'using', 'only'])

// A string, a comment, or an identifier chain such as `auth.member`, `"auth" . "member"` or `m.id`.
const part = String.raw`"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*`
const tokens = new RegExp(String.raw`'(?:[^']|'')*'|--[^\n]*|/\*[\s\S]*?\*/|((?:${part})(?:\s*\.\s*(?:${part}))*)`, 'g')

// A name as Postgres reads it: a quoted one as written, a bare one folded to lower case.
const unquote = (name: string) => (name.startsWith('"') ? name.slice(1, -1).replaceAll('""', '"') : name.toLowerCase())
const partsOf = (chain: string) => (chain.match(new RegExp(part, 'g')) ?? []).map(unquote)

/**
 * The scoped tables SQL text names, as `schema.table`: a name qualified with a scoped table's schema anywhere, and a
 * bare name after a keyword a table follows, such as `from member`. Strings and comments name nothing.
 */
export const scopedTablesIn = (text: string, names: readonly ScopedName[]) => {
  const found: string[] = []
  let previous: string | undefined
  for (const match of text.matchAll(tokens)) {
    const chain = match[1]
    if (chain === undefined) continue
    const parts = partsOf(chain)
    const [schema, table] = parts.length === 1 ? [undefined, parts[0]] : parts.slice(0, 2)
    const named = names.find((name) => name.table === table && (schema === undefined ? previous !== undefined && tableKeywords.has(previous) : name.schema === schema))
    if (named) found.push(`${named.schema}.${named.table}`)
    previous = parts.length === 1 ? parts[0] : undefined
  }
  return found
}
