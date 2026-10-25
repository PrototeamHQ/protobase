import { createWhere, printFilter, type ResourceModel } from '@protobase/schema'

const w = createWhere()

/**
 * The list request that finds a record the session's organization does not have, and the organization it is in: for a
 * resource whose lists read across the person's organizations (`tenantAcross`), with a key of one field they can
 * filter on. `undefined` for any other resource, whose record is simply not found.
 */
export const elsewhereRequest = (model: ResourceModel, recordKey: string) => {
  const [key, ...more] = model.primaryKey
  if (!model.tenantAcross || model.tenant === undefined || key === undefined || more.length > 0 || !model.fields[key]?.filterable) return undefined
  return { filter: printFilter(w.eq(key, recordKey)), pageSize: 1, fields: [key, model.tenant] }
}

/** The organization a found row is in, when it is another than `current`; `undefined` when it is not found or is there. */
export const otherOrganization = (model: ResourceModel, row: Record<string, unknown> | undefined, current: string | undefined) => {
  const tenant = row?.[model.tenant!]
  if (tenant === undefined || tenant === null || String(tenant) === current) return undefined
  return String(tenant)
}
