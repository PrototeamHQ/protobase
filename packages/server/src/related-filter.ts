import type { ParentRead } from '@protobase/query'
import { parseFilter, checkFilter, type FieldPath, type FilterError, type FilterExpr, type RelatedFilter, type ResourceModel } from '@protobase/schema'
import { relatedErrors, relatedTarget, splitRelated } from '@protobase/schema/internal'
import { filterProblem } from './filter-input'
import { HttpProblem } from './problem'
import { readScope } from './read-scope'
import { ownScope, requestAccess, type RequestAccess } from './request-access'

const usage = 'Use related(field, resource.field, (filter)), with relations to one resource on both sides'

// The same answer whether the resource does not exist or is hidden, whether its key is or the two fields do not meet,
// and for each the same as a field of the filter that does not exist: a refusal tells nothing of what is there.
const unknownTarget = ({ resource, key, span }: RelatedFilter) =>
  filterProblem('filter', [{ code: 'unknown-field', message: `Unknown field "${resource}.${key}"`, hint: usage, span } satisfies FilterError])

const checkedField = (model: ResourceModel, field: FieldPath, span: RelatedFilter['span']) => {
  const checked = checkFilter(model, { kind: 'present', field, span })
  if (!checked.ok) return { errors: checked.errors }
  if (checked.filter.kind !== 'present') throw new Error('Not implemented: checkFilter keeps the kind of the filter it checks')
  return { field: checked.filter.field }
}

/**
 * The caller's access on the resource, undefined whenever they cannot list it. A rule on it failing for this caller's id
 * says it exists, so that counts as unlisted too, and no tenant does as for a `read` parent.
 */
export const listAccess = async (access: RequestAccess, resource: string) => {
  const entry = access.deps.registry.find(resource)
  if (!entry || (entry.model.tenant && access.session.tenant === undefined)) return undefined
  const via = await requestAccess(access.deps, entry, access.session).catch((error: unknown) => {
    if (error instanceof HttpProblem && error.slug === 'owner-id-mismatch') return undefined
    throw error
  })
  return via?.resolved.operations.list ? via : undefined
}

// A term as one more read of the scope: the caller's list of the resource, in their own organization, and nothing else.
const relatedRead = async (access: RequestAccess, model: ResourceModel, term: RelatedFilter): Promise<ParentRead> => {
  const via = await listAccess(access, term.resource)
  if (!via) throw unknownTarget(term)
  const field = checkedField(model, term.field, term.span)
  if (field.errors) throw filterProblem('filter', field.errors)
  const key = checkedField(via.model, { kind: 'field', path: [term.key], span: term.span }, term.span)
  if (key.errors) throw unknownTarget(term)
  const target = relatedTarget(model, field.field)
  if (target === undefined || target !== relatedTarget(via.model, key.field)) throw unknownTarget(term)
  const { filter, parents } = await checkedTerms(via, via.model, term.filter)
  const own = ownScope(via)
  return {
    field: access.full.fields[field.field.name]!,
    parent: { model: via.full, key: via.full.fields[key.field.name]!, scope: { ...own, parents: [...(own.parents ?? []), ...parents] } },
    related: { model: via.model, ...(filter && { filter }) },
  }
}

// A filter without its `related()` terms, checked, and those terms as reads, each in turn so a refusal is always the first's.
const checkedTerms = async (access: RequestAccess, model: ResourceModel, ast: FilterExpr | undefined) => {
  if (!ast) return { filter: undefined, parents: [] }
  const { terms, rest } = splitRelated(ast)
  const checked = rest && checkFilter(model, rest)
  if (checked && !checked.ok) throw filterProblem('filter', checked.errors)
  const parents: ParentRead[] = []
  for (const term of terms) parents.push(await relatedRead(access, model, term))
  return { filter: checked?.filter, parents }
}

/**
 * The caller's filter of a list-style read, checked against `model`, and the scope the read runs in. Each `related()`
 * term ANDed at the top of it becomes one more read of that scope, so it may do only what the caller could do in two
 * steps: list the resource with the subfilter, then filter on the keys. It reads the session's own organization, so a
 * list across organizations falls back to that one too. `within` is what the server narrows the read by, such as the
 * record a list stands under, read the same way but kept apart from the caller's own limits and from what a facet drops.
 */
export const readFilter = async (access: RequestAccess, model: ResourceModel, full: ResourceModel, source?: string, maxLength?: number, within?: FilterExpr) => {
  const parsed = source?.trim() ? parseFilter(source, maxLength ? { maxLength } : {}) : undefined
  if (parsed && !parsed.ok) throw filterProblem('filter', parsed.errors)
  const shape = parsed?.ast ? relatedErrors(parsed.ast) : []
  if (shape.length > 0) throw filterProblem('filter', shape)
  const { filter, parents } = await checkedTerms(access, model, parsed?.ast)
  const kept = await checkedTerms(access, model, within)
  const terms = [...parents, ...kept.parents]
  const base = terms.length === 0 ? await readScope(access, full) : ownScope(access, full)
  return { filter, scope: { ...base, ...(terms.length > 0 && { parents: [...(base.parents ?? []), ...terms] }), ...(kept.filter && { within: kept.filter }) } }
}
