import { sql, type Expression, type SqlBool } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { jsonHas, jsonPresent } from './fields/json'
import { compileCompare, compileIn } from './compile-compare'
import { compileRegex, compileSearch, compileSimilar } from './compile-text-match'
import { columnRef, tableSource } from './columns'
import { QueryError } from './errors'
import { lookupReadOf, type LookupRead } from './lookup-read'

export type CompileOptions = {
  /** Minimum pg_trgm similarity for `similar`, from 0.3 (the `%` operator's own floor) to 1. */
  similarityThreshold?: number
}

const defaultSimilarity = 0.3

const combine = (parts: Expression<SqlBool>[], joiner: 'and' | 'or') => {
  if (parts.length === 0) return sql<SqlBool>`${sql.lit(joiner === 'and')}`
  return sql<SqlBool>`(${sql.join(parts, sql` ${sql.raw(joiner)} `)})`
}

type Term = Exclude<CheckedFilter, { kind: 'and' | 'or' | 'not' | 'search' }>

// A term on a lookup field holds when the one linked record the caller reads holds it on its field: the record's link
// is among the keys of the linked records that do, which an index on each table serves. Empty is the opposite of a
// linked record whose field is not empty, so no linked record, or one the caller does not read, is empty too.
const lookupTerm = (node: Term, read: LookupRead, threshold: number) => {
  const held = node.kind === 'isNull' ? sql<SqlBool>`${columnRef(read.value)} is not null` : compileNode(read.model, { ...node, field: read.value }, threshold)
  // A null key matches no record, and in a list of keys would make `not in` unknown
  const matched = read.match.nullable ? [sql<SqlBool>`${columnRef(read.match)} is not null`] : []
  const keys = sql`select ${columnRef(read.match)} from ${tableSource(read.model)} where ${sql.join([...read.conditions, ...matched, held], sql` and `)}`
  const link = columnRef(read.link)
  const linked = read.link.nullable ? sql<SqlBool>`(${link} is not null and ${link} in (${keys}))` : sql<SqlBool>`${link} in (${keys})`
  return node.kind === 'isNull' ? sql<SqlBool>`not ${linked}` : linked
}

const compileNode = (model: ResourceModel, node: CheckedFilter, threshold: number): Expression<SqlBool> => {
  const read = 'field' in node ? lookupReadOf(node.field) : undefined
  if (read) return lookupTerm(node as Term, read, threshold)
  switch (node.kind) {
    case 'and':
    case 'or':
      return combine(node.args.map(arg => compileNode(model, arg, threshold)), node.kind)
    case 'not':
      return sql<SqlBool>`not ${compileNode(model, node.arg, threshold)}`
    case 'compare':
      return compileCompare(node)
    case 'in':
      return compileIn(node)
    case 'has':
      return jsonHas(columnRef(node.field), node.value)
    case 'present':
      return node.field.type === 'json'
        ? jsonPresent(columnRef(node.field))
        : sql<SqlBool>`${columnRef(node.field)} is not null`
    case 'isNull':
      return sql<SqlBool>`${columnRef(node.field)} is null`
    case 'regex':
      return compileRegex(node)
    case 'similar':
      return compileSimilar(node, threshold)
    case 'search':
      return compileSearch(model, node)
  }
}

/** Compiles a checked filter; every user value becomes a bound parameter. */
export const compileFilter = (model: ResourceModel, filter: CheckedFilter, options: CompileOptions = {}): Expression<SqlBool> => {
  const threshold = options.similarityThreshold ?? defaultSimilarity
  if (!(threshold >= defaultSimilarity && threshold <= 1)) {
    throw new QueryError('invalid_option', `similarityThreshold must be between ${defaultSimilarity} and 1`)
  }
  return compileNode(model, filter, threshold)
}
