import type { ParentRead, Scope } from '@protobase/query'
import type { ResolvedAccess, ResourceModel } from '@protobase/schema'
import type { Entry } from './registry'
import type { Session } from './types'

/** The caller's access on a parent resource and their scope there, its own parents followed unless `chain` holds it. */
type AccessOf = (entry: Entry, chain: readonly string[]) => Promise<{ resolved: ResolvedAccess; full: ResourceModel; scope: Scope }>

/**
 * The parents the caller must read for a record of `entry` to be seen (`.parent(fk, 'read')`), each with the caller's
 * scope on the parent's resource: tenant, read row filter, soft delete and its own parents. A caller who cannot read the
 * parent resource, or whose read rule there needs the record, which no query can express, reads no parent. `chain` holds
 * the resources whose parents led here: one already on it is not followed further, so a resource that is its own parent,
 * such as a tree, is checked one level up. Reached as its own parent, the last on `chain`, it still follows its other
 * parents, so a reply read through its thread keeps to the thread's channel too.
 */
export const parentReads = async (entry: Entry, session: Session, chain: readonly string[], accessOf: AccessOf, find: (name: string) => Entry | undefined): Promise<ParentRead[]> => {
  const ownParent = chain.at(-1) === entry.name
  if (!ownParent && chain.includes(entry.name)) return []
  const isSelf = (field: string) => entry.model.fields[field]!.relation!.resource === entry.name
  const reads = (entry.model.parents ?? []).filter((parent) => parent.access === 'read' && !(ownParent && isSelf(parent.field)))
  return Promise.all(reads.map(async ({ field }): Promise<ParentRead> => {
    const relation = entry.model.fields[field]!
    const parentEntry = find(relation.relation!.resource)
    if (!parentEntry) throw new Error(`Parent "${field}" of "${entry.name}" points at "${relation.relation!.resource}", which the app does not have`)
    if (parentEntry.model.tenant && session.tenant === undefined) return { field: relation }
    const access = await accessOf(parentEntry, [...chain, entry.name])
    if (!access.resolved.operations.read || access.resolved.recordChecks.includes('read')) return { field: relation }
    return { field: relation, parent: { model: access.full, key: access.full.fields[access.full.primaryKey[0]!]!, scope: access.scope } }
  }))
}
