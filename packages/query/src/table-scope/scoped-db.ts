import type { Kysely } from 'kysely'
import type { Db } from '../db'
import type { Organization } from './scope-condition'
import { ScopePlugin } from './scope-plugin'
import type { ScopedTables } from './scoped-tables'

/**
 * The database kept to one organization (`ScopePlugin`): a query on a scoped table sees and writes that
 * organization's rows only. `unscoped(reason)` is the database without the scope, for work that means every
 * organization's rows, saying why; `withoutPlugins()` is refused, as it would drop the scope without a reason.
 */
export type ScopedDb = Kysely<any> & {
  /** The organization it works in; undefined for none. */
  readonly organization: Organization
  unscoped(reason: string): Db
}

// The methods that make another Kysely from this one, which keeps the scope and so stays a ScopedDb.
const derived = new Set<PropertyKey>(['withPlugin', 'withSchema', 'withTables'])

/** `db` kept to `organization` on the scoped tables of `scope`. */
export const scopedDb = (db: Db, scope: ScopedTables, organization: Organization): ScopedDb => {
  const unscoped = (reason: string) => {
    if (typeof reason !== 'string' || reason.trim() === '') throw new Error('db.unscoped needs a reason: say why this work reads every organization')
    return db
  }
  const wrap = (instance: Db): ScopedDb =>
    new Proxy(instance, {
      get(target, property) {
        if (property === 'unscoped') return unscoped
        if (property === 'organization') return organization
        if (property === 'withoutPlugins') {
          return () => {
            throw new Error("withoutPlugins() would drop the organization scope: use db.unscoped('<reason>')")
          }
        }
        const value: unknown = Reflect.get(target, property, target)
        if (typeof value !== 'function') return value
        if (derived.has(property)) return (...args: unknown[]) => wrap(value.apply(target, args))
        return value.bind(target)
      },
    }) as ScopedDb
  // Without a scoped table there is nothing to keep to the organization.
  return wrap(scope.tables.length === 0 ? db : db.withPlugin(new ScopePlugin(scope, organization)))
}
