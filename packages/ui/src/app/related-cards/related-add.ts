import type { ResourcePermissions } from '@protobase/client'
import type { RelatedModel, ViewModel } from '@protobase/schema'
import { createOffered } from '../create/create-offered'
import type { CurrentAddress } from '../current-address'

/**
 * Where a related section starts a record of its resource with `field` filled in with this record's key, to whoever
 * the list would offer New; none through a join resource, whose `field` holds another resource's key, or without a key.
 */
export const relatedAdd = (item: RelatedModel, value: string | number | boolean | null, view: ViewModel | undefined, pages: Readonly<Record<string, unknown>>, permissions: ResourcePermissions): CurrentAddress | undefined => {
  if (item.through || value === null) return
  if (!createOffered(view, pages, permissions)) return
  return { kind: 'create', resource: item.resource, values: { [item.field]: String(value) } }
}
