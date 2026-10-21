import type { Db } from '@protobase/query'
import type { ParentAccess, ResourceModel } from '@protobase/schema'
import type { Deps } from './deps'
import { fetchReadable } from './fetch-readable'
import { fetchRecord } from './records'
import type { Entry } from './registry'
import { recordDecision, requestAccess, type RequestAccess } from './request-access'
import { tenantScope } from './tenant'
import type { Row } from './types'

/** One parent record a write names: the relation pointing at it, the access it needs, and the record's path key. */
export type ParentTarget = { field: string; access: ParentAccess; resource: string; value: string | number; key: string }

type Scope = { trx: Db; deps: Deps; lock: boolean; accessOf: (entry: Entry) => Promise<RequestAccess> }

/** A record's identity across resources; `1` and `"1"` are the same record. */
export const pathKey = (resource: string, key: readonly unknown[]) => JSON.stringify([resource, ...key.map(String)])

/**
 * The parents these records name through `model.parents`, a null or missing relation naming none, sorted by path key:
 * the order they are locked in, so two writes naming the same parents lock them in the same order. A parent named twice
 * with the same need is checked once.
 */
export const parentTargets = (model: ResourceModel, records: Row[]): ParentTarget[] => {
  const targets = records.flatMap((record) => (model.parents ?? []).flatMap(({ field, access }) => {
    const value = record[field]
    if (value === undefined || value === null) return []
    const resource = model.fields[field]!.relation!.resource
    return [{ field, access, resource, value: value as string | number, key: pathKey(resource, [value]) }]
  }))
  const unique = targets.filter((target, index) => targets.findIndex((other) => other.key === target.key && other.access === target.access) === index)
  return unique.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

// Whether the caller has `need` on the stored record with this key, read with their own rules on its resource: the read
// row filter, tenant, soft delete and record-level read rule, and for `update` the update row filter, the record-level
// update rule (for an update changing nothing) and the record's own parents.
const mayOn = async (scope: Scope, entry: Entry, key: (string | number)[], need: ParentAccess, path: string[]): Promise<boolean> => {
  const access = await scope.accessOf(entry)
  if (!access.resolved.operations.read) return false
  const found = await fetchReadable(scope.trx, access, key, 'hide', scope.lock ? { lock: 'no-key-update' } : {})
  if (!found) return false
  if (need === 'read') return true
  if (!access.resolved.operations.update) return false
  const tenant = tenantScope(entry, access.session)?.tenantValue
  const keyField = [access.full.fields[access.full.primaryKey[0]!]!]
  const filter = access.resolved.rowFilter.update
  if (filter && !(await fetchRecord(scope.trx, entry, key, tenant, { filter, fields: keyField }))) return false
  if (access.resolved.recordChecks.includes('update')) {
    const decision = await recordDecision(access, 'update', found.record, {})
    if (decision === false) return false
    if (decision !== true && !(await fetchRecord(scope.trx, entry, key, tenant, { filter: decision, fields: keyField }))) return false
  }
  return parentsAllow(scope, access, [found.record], [...path, pathKey(entry.name, key)])
}

// Every parent the records name must allow, in lock order; the first refusal stops. A parent already on the path (the
// record being written or one of its ancestors) is a cycle, and refuses.
const parentsAllow = async (scope: Scope, access: RequestAccess, records: Row[], path: string[]) => {
  for (const target of parentTargets(access.full, records)) {
    if (path.includes(target.key)) return false
    const entry = scope.deps.registry.find(target.resource)
    if (!entry) throw new Error(`Parent "${target.field}" of "${access.entry.name}" points at "${target.resource}", which the app does not have`)
    if (!(await mayOn(scope, entry, [target.value], target.access, path))) return false
  }
  return true
}

const ownPath = (access: RequestAccess, records: Row[]) =>
  records
    .filter((record) => access.full.primaryKey.every((name) => record[name] !== undefined && record[name] !== null))
    .map((record) => pathKey(access.entry.name, access.full.primaryKey.map((name) => record[name])))

/**
 * Whether the caller may write records of `access`'s resource given the parents they name (`.parent()`): an update passes
 * the record before and after, so the parent it leaves and the one it moves to are locked in one order. With `lock`,
 * each parent is locked FOR NO KEY UPDATE until the transaction ends, so a parent changed or deleted at the same moment
 * cannot slip through; a read-only transaction cannot lock. Every call checks again; only each resource's access for
 * the session is reused.
 */
export const parentGuard = (trx: Db, access: RequestAccess, lock: boolean) => {
  const resolved = new Map<string, Promise<RequestAccess>>()
  const accessOf = (entry: Entry) => {
    if (!resolved.has(entry.name)) resolved.set(entry.name, requestAccess(access.deps, entry, access.session))
    return resolved.get(entry.name)!
  }
  const scope: Scope = { trx, deps: access.deps, lock, accessOf }
  return (...records: Row[]) => parentsAllow(scope, access, records, ownPath(access, records))
}
