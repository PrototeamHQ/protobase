import { checkFilter, createWhere, type ResourceModel } from '@protobase/schema'
import { listQuery, type Db } from '@protobase/query'
import type { Deps } from './deps'
import { badRequest } from './problem'
import { readScope } from './read-scope'
import { requestAccess, type RequestAccess } from './request-access'
import { exposeRow } from './rows'
import type { Row, Session } from './types'

const where = createWhere()

/**
 * One `labels` entry, `relation.field`: the records `relation` points at are named by their `field`. `access` is the
 * caller's access to that resource, absent when they cannot list it or cannot read `field`, so the keys go unnamed.
 */
export type LabelRequest = { relation: string; field: string; access?: RequestAccess }

/** Each relation's names, by the related record's key as text; a key the caller may not name is absent. */
export type RelatedLabels = Record<string, Record<string, string>>

const invalid = (entry: string, message: string) => badRequest('invalid-parameter', `Invalid labels entry "${entry}": ${message}`, { errors: [{ parameter: 'labels', message }] })

// Files and JSON hold no text that names a record.
const unnameable = new Set(['file', 'json'])

/**
 * Checks `labels` against the listed resource as the caller sees it: each entry names a returned relation to a
 * single-key resource, once. What the caller may read of the related resource is resolved here too, so a related
 * resource or field they cannot read answers no names rather than an error that would tell it exists.
 */
export const labelRequests = async (deps: Deps, session: Session, model: ResourceModel, returned: string[] | undefined, labels?: string | string[]): Promise<LabelRequest[]> => {
  if (labels === undefined) return []
  const entries = (Array.isArray(labels) ? labels : labels.split(',')).map((entry) => entry.trim()).filter(Boolean)
  const seen = new Set<string>()
  return Promise.all(entries.map(async (entry): Promise<LabelRequest> => {
    const [relation, field, ...rest] = entry.split('.')
    if (!relation || !field || rest.length > 0) throw invalid(entry, 'Name a relation and the field that names its records, as relation.field')
    const owner = Object.hasOwn(model.fields, relation) ? model.fields[relation]! : undefined
    if (!owner) throw invalid(entry, `Unknown field "${relation}"`)
    const target = owner.type === 'relation' && owner.relation ? deps.registry.find(owner.relation.resource) : undefined
    if (!target || target.model.primaryKey.length !== 1) throw invalid(entry, `"${relation}" is not a relation to a resource with a single-field key`)
    if (returned && !returned.includes(relation)) throw invalid(entry, `"${relation}" is not among the returned fields`)
    if (seen.has(relation)) throw invalid(entry, `"${relation}" is named twice`)
    seen.add(relation)
    const access = await requestAccess(deps, target, session)
    const named = Object.hasOwn(access.model.fields, field) ? access.model.fields[field]! : undefined
    if (!access.resolved.operations.list || !named) return { relation, field }
    if (unnameable.has(named.type)) throw invalid(entry, `"${field}" is a ${named.type} field, which cannot name a record`)
    return { relation, field, access }
  }))
}

// The names of these keys, read as the caller lists the related resource: its tenant, row filter and soft delete apply.
const namesOf = async (trx: Db, { field, access }: Required<LabelRequest>, keys: string[]) => {
  const key = access.full.primaryKey[0]!
  // The key is matched even where it is not filterable: the caller holds these keys already
  const model = { ...access.model, fields: { ...access.model.fields, [key]: { ...access.model.fields[key]!, filterable: true } } }
  const filter = checkFilter(model, where.in(key, keys))
  if (!filter.ok) throw new Error(`Keys of "${access.entry.name}" do not make a filter: ${filter.errors[0]!.message}`)
  const page = await listQuery(trx, model, { filter: filter.filter, columns: [key, field], limit: keys.length }, await readScope(access))
  const named = page.rows.map((row) => exposeRow(model, row)).filter((row) => row[field] !== null && row[field] !== undefined)
  return Object.fromEntries(named.map((row) => [String(row[key]), String(row[field])]))
}

/** The names of the records the rows' relations point at, one query per requested relation. */
export const relatedLabels = async (trx: Db, requests: LabelRequest[], rows: Row[]): Promise<RelatedLabels> => {
  const labels: RelatedLabels = {}
  for (const request of requests) {
    const keys = [...new Set(rows.flatMap((row) => (row[request.relation] === null || row[request.relation] === undefined ? [] : [String(row[request.relation])])))]
    labels[request.relation] = request.access && keys.length > 0 ? await namesOf(trx, request as Required<LabelRequest>, keys) : {}
  }
  return labels
}
