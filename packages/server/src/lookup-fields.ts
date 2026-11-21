import { lookupRead, withLookupRead, type LookupRead, type Scope } from '@protobase/query'
import type { FieldModel, ResolvedAccess, ResourceModel } from '@protobase/schema'
import { lookupLink } from '@protobase/schema/internal'
import type { Entry } from './registry'
import type { Session } from './types'

/** The caller's access on a linked resource: what they may do, its full model, the fields they see and their scope. */
type LinkedAccess = { resolved: ResolvedAccess; full: ResourceModel; model: ResourceModel; scope: Scope }
type AccessOf = (entry: Entry) => Promise<LinkedAccess>

const readOf = async (entry: Entry, field: FieldModel, session: Session, readable: ResourceModel, accessOf: AccessOf, find: (name: string) => Entry | undefined): Promise<LookupRead | undefined> => {
  // Startup has checked every resource and field a lookup names (`checkLookups`), so a missing one is a bug
  const link = lookupLink(entry.model, field, (name) => find(name)?.model)
  if (!link) throw new Error(`Lookup field "${field.name}" of "${entry.name}" names a resource or field the app does not have`)
  const { via, from } = field.lookup!
  if (from === undefined && !Object.hasOwn(readable.fields, via)) return
  const linked = find(link.linked.name)!
  if (linked.model.tenant && session.tenant === undefined) return
  const access = await accessOf(linked)
  if (!access.resolved.operations.read || access.resolved.recordChecks.includes('read')) return
  if (!access.model.fields[link.value.name] || (from !== undefined && !access.model.fields[via])) return
  return lookupRead({ model: access.full, scope: access.scope, value: link.value, match: link.match, link: link.link })
}

/**
 * The lookup fields of `readable` the caller sees, each as `/meta` shows it (`shown`) and as a query reads it (`read`):
 * those whose linked field the caller reads, on a linked resource they read without a record-level rule, in their
 * tenant. The linked records keep to the caller's scope on them: soft delete, tenant, row filter and the parents they
 * read. Through this resource's own relation the caller reads that relation too; through another resource's, its
 * relation to this one.
 */
export const lookupFields = async (entry: Entry, session: Session, readable: ResourceModel, accessOf: AccessOf, find: (name: string) => Entry | undefined) => {
  const found = await Promise.all(Object.values(readable.lookups ?? {}).map(async (field) => ({ field, read: await readOf(entry, field, session, readable, accessOf, find) })))
  const seen = found.filter((lookup): lookup is { field: FieldModel; read: LookupRead } => lookup.read !== undefined)
  return {
    shown: Object.fromEntries(seen.map(({ field }) => [field.name, field])),
    read: Object.fromEntries(seen.map(({ field, read }) => [field.name, withLookupRead(field, read)])),
  }
}
