import { ConnectionBuilder, ControlledTransactionBuilder, Kysely, QueryCreator, TransactionBuilder, type KyselyPlugin } from 'kysely'
import type { Db } from '../db'
import { currentOrganization, type EveryOrganization, type ScopeOrganization } from './organization-source'
import type { Organization } from './scope-condition'
import { ScopePlugin } from './scope-plugin'
import type { ScopedTables } from './scoped-tables'

/**
 * The database kept to one organization (`ScopePlugin`): a query on a scoped table sees and writes that
 * organization's rows only. `unscoped(reason)` is the same database without the scope, its schema and other plugins
 * kept, for work that means every organization's rows, saying why; `withoutPlugins()` is refused, as it would drop the
 * scope without a reason. What it makes keeps the scope and the refusal: `withSchema`, `withPlugin`, `withTables`,
 * `with`, and the database a transaction or connection gives its callback.
 */
export type ScopedDb = {
  withSchema(schema: string): ScopedDb
  withPlugin(plugin: KyselyPlugin): ScopedDb
  withTables<T extends Record<string, Record<string, any>>>(): ScopedDb
} & Kysely<any> & {
    /** The organization it works in now; undefined for none, `{ unscoped }` while its source gives every organization. */
    readonly organization: Organization | EveryOrganization
    unscoped(reason: string): Db
  }

const refuseWithoutPlugins = () => {
  throw new Error("withoutPlugins() would drop the organization scope: use db.unscoped('<reason>')")
}

// The database without the scope's plugin, every other plugin kept in its order, such as `withSchema`'s.
const withoutScope = <Instance extends Kysely<any>>(instance: Instance) =>
  instance
    .getExecutor()
    .plugins.filter((plugin) => !(plugin instanceof ScopePlugin))
    .reduce<Kysely<any>>((done, plugin) => done.withPlugin(plugin), instance.withoutPlugins())

/**
 * `db` kept to `organization` on the scoped tables of `scope`: a fixed one, or an `OrganizationSource` read as each
 * query is built, for a database made once that serves many organizations, such as from the request a query runs for.
 */
export const scopedDb = (db: Db, scope: ScopedTables, organization: ScopeOrganization): ScopedDb => {
  const unscopedOf = (instance: Kysely<any>) => (reason: string) => {
    if (typeof reason !== 'string' || reason.trim() === '') throw new Error('db.unscoped needs a reason: say why this work reads every organization')
    return withoutScope(instance)
  }

  // What a method of a guarded object returns, guarded in turn where it can reach the database without the scope.
  const guard = (value: unknown): unknown => {
    if (value instanceof Kysely) return guardDb(value)
    if (value instanceof QueryCreator) return guarded(value, {})
    if (value instanceof TransactionBuilder || value instanceof ConnectionBuilder || value instanceof ControlledTransactionBuilder) return guardBuilder(value)
    return value
  }

  // An object whose methods' results are guarded, with `withoutPlugins` refused and `own` properties of its own.
  const guarded = <Target extends object>(target: Target, own: Record<PropertyKey, unknown>): Target =>
    new Proxy(target, {
      get(on, property) {
        if (property === 'withoutPlugins') return refuseWithoutPlugins
        if (property in own) return own[property]
        const value: unknown = Reflect.get(on, property, on)
        if (typeof value !== 'function') return value
        return (...args: unknown[]) => guard(value.apply(on, args))
      },
    })

  const guardDb = (instance: Kysely<any>) =>
    guarded(instance, {
      unscoped: unscopedOf(instance),
      get organization() {
        return currentOrganization(organization)
      },
    })

  // A transaction or connection builder: the database its callback gets, or its `execute` resolves to, is guarded.
  const guardBuilder = <Builder extends object>(builder: Builder) =>
    new Proxy(builder, {
      get(on, property) {
        const value: unknown = Reflect.get(on, property, on)
        if (typeof value !== 'function') return value
        if (property !== 'execute') return (...args: unknown[]) => guard(value.apply(on, args))
        return (callback?: unknown, ...rest: unknown[]) => {
          const wrapped = typeof callback === 'function' ? (handle: unknown) => callback(guard(handle)) : callback
          const result: unknown = value.apply(on, [wrapped, ...rest])
          return result instanceof Promise ? result.then(guard) : result
        }
      },
    })

  // Without a scoped table there is nothing to keep to the organization.
  return guardDb(scope.tables.length === 0 ? db : db.withPlugin(new ScopePlugin(scope, organization))) as ScopedDb
}
