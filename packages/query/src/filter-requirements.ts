import { sql } from 'kysely'
import type { CheckedFilter } from '@protobase/schema'
import type { Scope } from './scope'
import type { Db } from './db'
import { QueryError } from './errors'

const usesSimilar = (node: CheckedFilter): boolean => {
  if (node.kind === 'similar') return true
  if (node.kind === 'and' || node.kind === 'or') return node.args.some(usesSimilar)
  return node.kind === 'not' && usesSimilar(node.arg)
}

// The row filter, and the subfilters of `related()` terms with the scope each reads in.
const scopeUsesSimilar = (scope?: Scope): boolean =>
  Boolean(scope?.rowFilter && usesSimilar(scope.rowFilter)) ||
  (scope?.parents ?? []).some(({ parent, related }) => related !== undefined && (Boolean(related.filter && usesSimilar(related.filter)) || scopeUsesSimilar(parent?.scope)))

/** Fails with a clear error, before any query runs, when the filter needs an extension the database lacks. */
export const assertFilterRequirements = async (db: Db, filter?: CheckedFilter, scope?: Scope) => {
  if (!(filter && usesSimilar(filter)) && !scopeUsesSimilar(scope)) return
  const result = await sql<{ n: string }>`select count(*)::text as n from pg_extension where extname = 'pg_trgm'`.execute(db)
  if (result.rows[0]?.n === '0') {
    throw new QueryError('missing_extension', 'similar() needs the pg_trgm extension: run "create extension pg_trgm"')
  }
}
