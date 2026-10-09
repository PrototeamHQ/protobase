import type { ResourceModel } from '../model'
import type { ResolvedAccess } from './resolve'

/**
 * The resource as one user may see it: only readable fields remain, and a field is `readOnly`
 * unless it is writable on create or update. `search` (and `searchMatch`) shrinks to readable fields, and `tenant`,
 * `softDelete` and `owner` are dropped when their field is hidden. Key columns always stay,
 * because records are addressed by them.
 *
 * Use the restricted model for everything user-facing (checking filters, sorts, queries,
 * OpenAPI, `/meta`), so hidden fields cannot be referenced at all. Row filters from access
 * rules (`access.rowFilter`) are checked against the full model instead and kept separate:
 * they may use hidden or non-filterable columns.
 */
export const restrictModel = (
  model: ResourceModel,
  access: Pick<ResolvedAccess, 'readableFields' | 'writableFields'>,
): ResourceModel => {
  const visible = new Set([...access.readableFields, ...model.primaryKey])
  const writable = new Set([...access.writableFields.create, ...access.writableFields.update])
  const keep = (name: string | undefined) => (name !== undefined && visible.has(name) ? name : undefined)
  const search = model.search?.filter((name) => visible.has(name))
  const searchMatch = model.searchMatch && Object.entries(model.searchMatch).filter(([name]) => visible.has(name))
  const { search: _search, searchMatch: _searchMatch, tenant: _tenant, softDelete: _softDelete, owner: _owner, ...rest } = model
  const tenant = keep(model.tenant)
  const softDelete = keep(model.softDelete)
  const owner = keep(model.owner)
  return {
    ...rest,
    fields: Object.fromEntries(
      Object.entries(model.fields)
        .filter(([name]) => visible.has(name))
        .map(([name, field]) => [name, { ...field, readOnly: !writable.has(name) }]),
    ),
    ...(search?.length && { search }),
    ...(searchMatch?.length && { searchMatch: Object.fromEntries(searchMatch) }),
    ...(tenant && { tenant }),
    ...(softDelete && { softDelete }),
    ...(owner && { owner }),
  }
}
