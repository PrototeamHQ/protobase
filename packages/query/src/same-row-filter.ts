import { sql, type RawBuilder, type SqlBool } from 'kysely'
import type { CheckedFilter, FieldModel, Literal, ResourceModel } from '@protobase/schema'
import { columnRef, tableSource } from './columns'
import { compileFilter } from './compile-filter'
import type { Db } from './db'
import { lookupReadOf } from './lookup-read'
import { parentKeys } from './parent-keys'
import { readConditions } from './read-conditions'
import { fullModelOf, type ParentRead, type Scope } from './scope'

const span = { start: 0, end: 0 }

/** A part of the filter, built once the subqueries it reads are resolved to their values (as text). */
type Part = (resolved: string[][]) => CheckedFilter

const numeric = (field: FieldModel) => field.type === 'integer' || field.type === 'bigint'

// A key or tenant value as a filter literal: a number for integer keys, keeping digits a `number` cannot hold, else text.
// A relation holds the type of the key it points at, so a resolved value is typed by that key.
const literalOf = (value: string, number: boolean): Literal => (number ? { kind: 'number', value: Number(value), raw: value, span } : { kind: 'string', value, span })

const and = (args: CheckedFilter[]): CheckedFilter => (args.length === 1 ? args[0]! : { kind: 'and', args, span })

/**
 * The read's filter with every condition that reads another row (a parent the caller must read, a `related()` term, a
 * lookup field) resolved to the values it holds now, so the rest only reads the row itself: what a subscriber of the
 * read checks each changed row against. Undefined when a part cannot be made so: a search over a lookup field.
 */
export const sameRowPlan = (model: ResourceModel, scope: Scope | undefined, filter: CheckedFilter | undefined) => {
  const full = fullModelOf(model, scope)
  const subqueries: RawBuilder<unknown>[] = []
  const pending = (query: RawBuilder<unknown>) => subqueries.push(query) - 1
  // No row has a null primary key, so this term holds for none: `in()` with no values, which the syntax has no form of.
  const none: CheckedFilter = { kind: 'isNull', field: full.fields[full.primaryKey[0]!]!, span }
  const among = (field: FieldModel, values: string[], number: boolean): CheckedFilter => (values.length === 0 ? none : { kind: 'in', field, values: values.map((value) => literalOf(value, number)), span })

  // A term on a lookup field holds when the row's link is among the keys of the linked records that hold it, as compiled.
  const lookupTerm = (node: Extract<CheckedFilter, { field: FieldModel }>): Part | undefined => {
    const read = lookupReadOf(node.field)
    if (!read) return () => node
    const held = node.kind === 'isNull' ? sql<SqlBool>`${columnRef(read.value)} is not null` : compileFilter(read.model, { ...node, field: read.value } as CheckedFilter)
    const matched = read.match.nullable ? [sql<SqlBool>`${columnRef(read.match)} is not null`] : []
    const index = pending(sql`select ${columnRef(read.match)} from ${tableSource(read.model)} where ${sql.join([...read.conditions, ...matched, held], sql` and `)}`)
    return (resolved) => {
      const keys = resolved[index]!
      const linked = among(read.link, keys, numeric(read.match) || numeric(read.link))
      if (node.kind !== 'isNull') return linked
      // A row that links to nothing has an empty lookup, as compiled, which `not in` alone leaves unknown
      const unlinked: CheckedFilter = { kind: 'not', arg: linked, span }
      return read.link.nullable && keys.length > 0 ? { kind: 'or', args: [{ kind: 'isNull', field: read.link, span }, unlinked], span } : unlinked
    }
  }

  const walk = (node: CheckedFilter): Part | undefined => {
    if (node.kind === 'and' || node.kind === 'or') {
      const args = node.args.map(walk)
      if (args.some((arg) => arg === undefined)) return
      return (resolved) => ({ kind: node.kind, args: args.map((arg) => arg!(resolved)), span })
    }
    if (node.kind === 'not') {
      const arg = walk(node.arg)
      return arg && ((resolved) => ({ kind: 'not', arg: arg(resolved), span }))
    }
    if (node.kind === 'search') return model.search?.some((name) => model.fields[name]?.lookup) ? undefined : () => node
    return lookupTerm(node)
  }

  const parent = (read: ParentRead): Part => {
    if (!read.parent) return () => (read.field.nullable && !read.related ? { kind: 'isNull', field: read.field, span } : none)
    const subfilter = read.related?.filter ? [compileFilter(read.related.model, read.related.filter)] : []
    const index = pending(parentKeys(read.parent, read.related?.page, [...readConditions(read.parent.model, read.parent.scope), ...subfilter]))
    return (resolved) => {
      const keys = read.parent!.items ? read.parent!.items === 'integer' || read.parent!.items === 'bigint' : numeric(read.parent!.key)
      const within = among(read.field, resolved[index]!, keys)
      return read.field.nullable && !read.related ? { kind: 'or', args: [{ kind: 'isNull', field: read.field, span }, within], span } : within
    }
  }

  const tenant = (): Part[] => {
    const name = full.tenant ?? model.tenant
    if (!name) return []
    const field = full.fields[name]!
    if (scope?.tenantValues) return [() => among(field, scope.tenantValues!.map(String), numeric(field))]
    if (scope?.tenantValue === undefined) throw new Error(`Resource "${model.name}" is tenant-scoped; pass scope.tenantValue`)
    // `in`, not `=`, which reads a `*` in text as a wildcard
    return [() => among(field, [String(scope.tenantValue)], numeric(field))]
  }

  const softDelete = full.softDelete ?? model.softDelete
  const parts = [
    ...(softDelete ? [(): CheckedFilter => ({ kind: 'isNull', field: full.fields[softDelete]!, span })] : []),
    ...tenant(),
    ...[scope?.rowFilter, scope?.within, filter].filter((node) => node !== undefined).map(walk),
    ...(scope?.parents ?? []).map(parent),
  ]
  if (parts.some((part) => part === undefined)) return
  return { subqueries, build: (resolved: string[][]) => (parts.length === 0 ? undefined : and(parts.map((part) => part!(resolved)))) }
}

/**
 * What a read keeps to as one filter on the row alone: its soft delete, tenant, row filter and parents (`readConditions`)
 * and `filter`, with each subquery among them read once, all in one statement, in `trx`, so with its snapshot. Undefined
 * for a read that keeps no row out, `false` when a part cannot be made to read the row alone.
 */
export const sameRowFilter = async (trx: Db, model: ResourceModel, scope: Scope | undefined, filter: CheckedFilter | undefined) => {
  const planned = sameRowPlan(model, scope, filter)
  if (!planned) return false
  if (planned.subqueries.length === 0) return planned.build([])
  const columns = planned.subqueries.map((query, i) => sql`array(select v::text from (${query}) as s(v) where v is not null) as ${sql.id(`s${i}`)}`)
  const { rows } = await sql<Record<string, string[]>>`select ${sql.join(columns)}`.execute(trx)
  return planned.build(planned.subqueries.map((_, i) => rows[0]![`s${i}`]!))
}
