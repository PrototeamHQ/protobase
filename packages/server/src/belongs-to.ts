import { printFilter, where, type FilterExpr, type ResourceModel } from '@protobase/schema'
import { relatedTarget } from '@protobase/schema/internal'
import type { Deps } from './deps'
import { fetchReadable } from './fetch-readable'
import { badRequest, notFound } from './problem'
import type { Entry } from './registry'
import { listAccess } from './related-filter'
import { hasNoAccess, requestAccess, requireOperation, type RequestAccess } from './request-access'
import { readTransaction } from './transactions'
import type { Session } from './types'

type KeyValue = string | number

const filterableIn = (model: ResourceModel, name: string) => (Object.hasOwn(model.fields, name) && model.fields[name]!.filterable ? model.fields[name] : undefined)

const relationsTo = (model: ResourceModel, resource: string) =>
  Object.values(model.fields).filter((field) => field.filterable && field.relation !== undefined && relatedTarget(model, field) === resource)

// The child's fields that hold the keys of the far side of a link: its own single key, else its relations to that resource.
const fieldsMeeting = (model: ResourceModel, far: string) => {
  if (model.name !== far) return relationsTo(model, far)
  const own = model.primaryKey.length === 1 ? filterableIn(model, model.primaryKey[0]!) : undefined
  return own ? [own] : []
}

// Each declared link the caller may list, with the sides that lead away from the parent.
const linkPaths = async (access: RequestAccess, parent: Entry, key: KeyValue) => {
  const links = access.deps.registry.entries.filter((link) => link.model.links && link.name !== access.entry.name)
  const paths = await Promise.all(links.map(async (link): Promise<FilterExpr[]> => {
    const via = await listAccess(access, link.name)
    if (!via) return []
    const [first, second] = link.model.links!
    const side = (near: string, far: string) => {
      const at = filterableIn(via.model, near)
      const away = filterableIn(via.model, far)
      if (!at || !away || relatedTarget(via.model, at) !== parent.name) return []
      return fieldsMeeting(access.model, relatedTarget(via.model, away)!).map((field) => where.related(field.name, link.name, far, where.eq(near, key)))
    }
    return [...side(first, second), ...side(second, first)]
  }))
  return paths.flat()
}

/** The ways a record of the child belongs to the parent record `key`: a relation to the parent, or through a declared link. */
export const belongingPaths = async (access: RequestAccess, parent: Entry, key: KeyValue) => [
  ...relationsTo(access.model, parent.name).map((field) => where.eq(field.name, key)),
  ...(await linkPaths(access, parent, key)),
]

// As the caller would read it: a parent that is missing and one hidden from them, by any rule, answer alike.
const requireParent = async (deps: Deps, parent: Entry, session: Session, key: KeyValue[]) => {
  const access = await requestAccess(deps, parent, session)
  if (hasNoAccess(access.resolved)) throw notFound(`There is no resource "${parent.name}"`)
  const name = access.full.primaryKey[0]!
  const read = access.resolved.operations.read && (await readTransaction(deps.db, deps.statementTimeoutMs, (trx) => fetchReadable(trx, access, key, 'hide', { etagFields: [], fields: [access.full.fields[name]!] })))
  if (!read) throw notFound(`No ${parent.name} with this key`)
}

/**
 * What keeps a list of `entry` to the parent record `key`, for its read's `within`: refused like a list of `entry` when
 * they may not list it, a 404 alike for a parent that is missing or hidden, or when no way leads there, and a 400 when
 * several do, since the path cannot say which is meant.
 */
export const belongingFilter = async (deps: Deps, entry: Entry, session: Session, parent: Entry, key: KeyValue[]) => {
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'list')
  await requireParent(deps, parent, session, key)
  const paths = parent.model.primaryKey.length === 1 ? await belongingPaths(access, parent, key[0]!) : []
  if (paths.length === 0) throw notFound(`There is no list of ${entry.name} under ${parent.name}`)
  if (paths.length > 1) throw badRequest('ambiguous-parent', `${entry.name} belongs to ${parent.name} in ${paths.length} ways: name one with a filter`, { paths: paths.map(printFilter) })
  return paths[0]!
}
