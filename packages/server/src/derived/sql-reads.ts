import { maybe, type Condition } from './condition'
import { conditionOf, conjuncts, type AstNode } from './sql-condition'

/**
 * What one query read of one table: the rows `condition` selects (by column) and the columns it used, `null` for every
 * column, as with `*` or a whole row.
 */
export type TableRead = { schema?: string; table: string; condition: Condition; columns: string[] | null }

/** A statement a derived value's compute function may not send: it writes, or does what cannot be told. */
export class UntrackedStatementError extends Error {}

// A table of one query level, with the expressions that limit which of its rows matter.
type Source = { schema?: string; table: string; alias: string; limits: AstNode[] }

const statementsThatRead = new Set(['SelectStmt'])
const statementsWithoutReads = new Set(['TransactionStmt', 'VariableSetStmt', 'VariableShowStmt'])

// Calls `visit` on every node of the tree, depth first; `visit` returns false to leave a node's children.
const walk = (node: unknown, visit: (node: AstNode) => boolean | void) => {
  if (Array.isArray(node)) return node.forEach((item) => walk(item, visit))
  if (!node || typeof node !== 'object') return
  if (visit(node as AstNode) === false) return
  for (const value of Object.values(node)) walk(value, visit)
}

/**
 * The tables of one query level's `FROM`, each with the expressions that limit its rows: an inner join's `ON` and the
 * `WHERE` limit every table they join; an outer join's `ON` limits only its optional side, which nothing above limits,
 * since a missing row changes the result there too.
 */
const sourcesOf = (item: AstNode, limits: AstNode[], ctes: Set<string>, out: Source[]): void => {
  if (item.RangeVar) {
    const { schemaname, relname, alias } = item.RangeVar
    if (!schemaname && ctes.has(relname)) return
    out.push({ ...(schemaname && { schema: schemaname }), table: relname, alias: alias?.aliasname ?? relname, limits })
    return
  }
  if (!item.JoinExpr) return
  const { jointype, larg, rarg, quals } = item.JoinExpr
  const on = conjuncts(quals)
  const [left, right] = { JOIN_LEFT: [limits, on], JOIN_RIGHT: [on, limits], JOIN_FULL: [[], []] }[jointype as string] ?? [[...limits, ...on], [...limits, ...on]]
  sourcesOf(larg, left!, ctes, out)
  sourcesOf(rarg, right!, ctes, out)
}

/**
 * The columns of each source that the level uses anywhere, nested queries included: a column qualified with its alias,
 * an unqualified one when it is the level's only source, and every column for `*` or a whole row.
 */
const columnsOf = (level: AstNode, sources: Source[]) => {
  const used = new Map<string, Set<string> | null>(sources.map((source) => [source.alias, new Set<string>()]))
  const add = (alias: string, column: string | null) => {
    const columns = used.get(alias)
    if (columns === undefined || columns === null) return
    if (column === null) used.set(alias, null)
    else columns.add(column)
  }
  const nested = new Set<AstNode>()
  walk(level, (node) => {
    if (node.SelectStmt && node.SelectStmt !== level) walk(node.SelectStmt, (inner) => void nested.add(inner))
    const ref = node.ColumnRef
    if (!ref) return
    const names = (ref.fields as AstNode[]).map((field) => (field.A_Star ? null : (field.String?.sval as string)))
    const last = names.at(-1)!
    if (names.length >= 2) return add(names.at(-2)!, last)
    if (used.has(last!)) add(last!, null)
    if (nested.has(node) && sources.length !== 1) return
    for (const source of sources) add(source.alias, last)
  })
  return used
}

// The query levels of a `SELECT`: itself, or both sides of a `UNION`, `INTERSECT` or `EXCEPT`, which the tree holds unwrapped.
const levelsOf = (select: AstNode): AstNode[] => (select.op === 'SETOP_NONE' ? [select] : [...levelsOf(select.larg), ...levelsOf(select.rarg)])

// One query level: a `SELECT` without `UNION` and the like, whose own `FROM` and `WHERE` say what it reads.
const levelReads = (level: AstNode, ctes: Set<string>, params: readonly unknown[]): TableRead[] => {
  const sources: Source[] = []
  const where = conjuncts(level.whereClause)
  for (const item of (level.fromClause ?? []) as AstNode[]) sourcesOf(item, where, ctes, sources)
  const columns = columnsOf(level, sources)
  return sources.map((source) => {
    const owner = (fields: string[]) => (fields.length === 1 ? (sources.length === 1 ? fields[0] : undefined) : fields.at(-2) === source.alias ? fields.at(-1) : undefined)
    const parts = source.limits.map((limit) => conditionOf(limit, owner, params))
    const condition: Condition = parts.length === 0 ? maybe : parts.length === 1 ? parts[0]! : { and: parts }
    const used = columns.get(source.alias)
    return { ...(source.schema && { schema: source.schema }), table: source.table, condition, columns: used ? [...used].sort() : null }
  })
}

/**
 * What a statement read, from Postgres's own parse tree: every table of every query level, the `WITH` queries and
 * nested ones in `FROM`, `WHERE` and the select list included, with the rows its conditions select. Statements that
 * read nothing, such as `BEGIN` or `SET`, give none; any other than a `SELECT` throws, as a compute function only reads.
 */
export const statementReads = (statement: AstNode, params: readonly unknown[]): TableRead[] => {
  const [kind] = Object.keys(statement)
  if (statementsWithoutReads.has(kind!)) return []
  if (!statementsThatRead.has(kind!)) throw new UntrackedStatementError(`A derived value's compute function only reads, and sent a ${kind}`)
  const ctes = new Set<string>()
  walk(statement, (node) => void (node.CommonTableExpr && ctes.add(node.CommonTableExpr.ctename)))
  const levels: AstNode[] = []
  walk(statement, (node) => void (node.SelectStmt && levels.push(...levelsOf(node.SelectStmt))))
  return levels.flatMap((level) => levelReads(level, ctes, params))
}
