import { sql, type Expression, type SqlBool } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { jsonHas, jsonPresent } from './fields/json'
import { compileCompare, compileIn } from './compile-compare'
import { compileRegex, compileSearch, compileSimilar } from './compile-text-match'
import { columnRef } from './columns'
import { QueryError } from './errors'

export type CompileOptions = {
  /** Minimum pg_trgm similarity for `similar`, from 0.3 (the `%` operator's own floor) to 1. */
  similarityThreshold?: number
}

const defaultSimilarity = 0.3

const combine = (parts: Expression<SqlBool>[], joiner: 'and' | 'or') => {
  if (parts.length === 0) return sql<SqlBool>`${sql.lit(joiner === 'and')}`
  return sql<SqlBool>`(${sql.join(parts, sql` ${sql.raw(joiner)} `)})`
}

const compileNode = (model: ResourceModel, node: CheckedFilter, threshold: number): Expression<SqlBool> => {
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
