/** A table whose rows belong to one organization, as SQL text names it: its schema and its name. */
export type ScopedName = { schema: string; table: string }

// The keywords a table name follows in a statement, where a bare name is a table rather than a column.
const tableKeywords = new Set(['from', 'join', 'update', 'into', 'table', 'using', 'only'])
// The keywords that end a list of tables, after which a comma separates columns or values again. A join's `on`
// condition does not: `from a join b on true, c` lists `c` too.
const clauseKeywords = new Set(['where', 'set', 'select', 'group', 'order', 'having', 'limit', 'offset', 'returning', 'values', 'window', 'union', 'except', 'intersect', 'for', 'default'])

// The end of a block comment that starts at `start`: Postgres nests them, `/* a /* b */ c */` being one.
const commentEnd = (text: string, start: number) => {
  let depth = 0
  for (let at = start; at < text.length - 1; at += 1) {
    if (text.startsWith('/*', at)) {
      depth += 1
      at += 1
    } else if (text.startsWith('*/', at)) {
      depth -= 1
      at += 1
      if (depth === 0) return at + 1
    }
  }
  return text.length
}

// The end of the quoted text that starts at `start` with `quote`, a doubled quote standing for one.
const quotedEnd = (text: string, start: number, quote: string) => {
  for (let at = start + 1; at < text.length; at += 1) {
    if (text[at] !== quote) continue
    if (text[at + 1] !== quote) return at + 1
    at += 1
  }
  return text.length
}

// What starts at a position: a dollar quote's tag, such as `$$` or `$body$`, and a bare name.
const matchAt = (pattern: RegExp, text: string, at: number) => {
  pattern.lastIndex = at
  return pattern.exec(text)?.[0]
}
const dollarTag = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y
const bareName = /[A-Za-z_][A-Za-z0-9_$]*/y

/** SQL text as the tokens that matter here: names (a quoted one as written, a bare one folded to lower case), dots, commas and parentheses. Strings and comments are none. */
export const sqlTokens = (text: string) => {
  const tokens: string[] = []
  let at = 0
  while (at < text.length) {
    const tag = matchAt(dollarTag, text, at)
    const name = matchAt(bareName, text, at)
    if (text.startsWith('--', at)) at = text.includes('\n', at) ? text.indexOf('\n', at) : text.length
    else if (text.startsWith('/*', at)) at = commentEnd(text, at)
    else if (text[at] === "'") at = quotedEnd(text, at, "'")
    else if (tag) at = text.includes(tag, at + tag.length) ? text.indexOf(tag, at + tag.length) + tag.length : text.length
    else if (text[at] === '"') {
      const end = quotedEnd(text, at, '"')
      tokens.push(`"${text.slice(at + 1, end - 1).replaceAll('""', '"')}`)
      at = end
    } else if (name) {
      tokens.push(name.toLowerCase())
      at += name.length
    } else {
      if ('.,()'.includes(text[at]!)) tokens.push(text[at]!)
      at += 1
    }
  }
  return tokens
}

// A name token without the mark of its quotes; a quoted name is never a keyword.
const nameOf = (token: string) => (token.startsWith('"') ? token.slice(1) : token)
const isName = (token: string | undefined) => token !== undefined && !'.,()'.includes(token)
const keyword = (token: string) => (token.startsWith('"') ? undefined : token)

/**
 * The scoped tables SQL text names, as `schema.table`: a name qualified with a scoped table's schema anywhere, and a
 * bare name where a table goes, after a keyword a table follows, such as `from member`, or after a comma in the list of
 * tables that keyword starts. Strings and comments name nothing.
 */
export const scopedTablesIn = (text: string, names: readonly ScopedName[]) => {
  const tokens = sqlTokens(text)
  const found: string[] = []
  let inTables = false
  // Whether each enclosing parenthesis opened in a list of tables, which goes on after it closes, as after a subquery.
  const outer: boolean[] = []
  let previous: string | undefined
  for (let at = 0; at < tokens.length; at += 1) {
    const token = tokens[at]!
    if (!isName(token)) {
      if (token === '(') {
        outer.push(inTables)
        inTables = false
      }
      if (token === ')') inTables = outer.pop() ?? false
      previous = token
      continue
    }
    const qualified = tokens[at + 1] === '.' && isName(tokens[at + 2])
    const [schema, table] = qualified ? [nameOf(token), nameOf(tokens[at + 2]!)] : [undefined, nameOf(token)]
    const tablePlace = previous !== undefined && ((keyword(previous) !== undefined && tableKeywords.has(previous)) || (previous === ',' && inTables))
    const named = names.find((name) => name.table === table && (schema === undefined ? tablePlace : name.schema === schema))
    if (named) found.push(`${named.schema}.${named.table}`)
    const word = keyword(token)
    if (word !== undefined && tableKeywords.has(word)) inTables = true
    if (word !== undefined && clauseKeywords.has(word)) inTables = false
    if (qualified) {
      // The rest of the chain, such as `.id` in `auth.member.id`, is no name of its own.
      while (tokens[at + 1] === '.' && isName(tokens[at + 2])) at += 2
    }
    previous = qualified ? `${schema}.${table}` : token
  }
  return found
}
