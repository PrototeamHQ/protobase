import { parseFilter, type FilterExpr } from '@protobase/schema'
import type { BoardColumn } from './board-columns'

const flatten = (expr: FilterExpr): FilterExpr[] => (expr.kind === 'and' ? expr.args.flatMap(flatten) : [expr])

const text = (value: { kind: string; value?: unknown }) => (value.kind === 'string' ? String(value.value) : undefined)

// The values `by = "v"` or `in(by, ...)` allows, or none for any other clause
const allowedBy = (clause: FilterExpr, by: string): string[] | undefined => {
  if (clause.kind === 'compare' && clause.op === '=' && clause.field.path.join('.') === by) {
    const value = text(clause.value)
    return value === undefined ? undefined : [value]
  }
  if (clause.kind === 'in' && clause.field.path.join('.') === by) {
    const values = clause.values.map(text)
    return values.every((value) => value !== undefined) ? (values as string[]) : undefined
  }
  return undefined
}

/**
 * The columns of a board `filter` does not rule out: those its top-level `by = "v"` and `in(by, ...)` clauses allow. Any
 * other clause leaves every column, so a column is left out only when no record in it can match.
 */
export const columnsAllowed = (filter: string, by: string, columns: BoardColumn[]): BoardColumn[] => {
  const parsed = parseFilter(filter)
  if (!parsed.ok || !parsed.ast) return columns
  const clauses = flatten(parsed.ast).map((clause) => allowedBy(clause, by)).filter((values) => values !== undefined)
  return columns.filter((column) => clauses.every((values) => column.value !== null && values.includes(column.value)))
}
