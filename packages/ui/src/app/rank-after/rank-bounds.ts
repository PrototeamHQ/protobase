import type { Client } from '@protobase/client'
import { printFilter, where, type ResourceModel, type ViewModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { recordKey, recordTitle } from '../../live/model-helpers'

/** A record a re-ranked record must stay below or above: its key as the API encodes it, its rank and its title. */
export type RankBound = { key: string; rank: unknown; title: string }

/**
 * What a re-ranked record must keep to, by its position's `after`: `after`, the pending records it depends on, which it
 * must rank below; `before`, the records that depend on it while it is pending, which must rank below it.
 */
export type RankBounds = { after: RankBound[]; before: RankBound[] }

// A record's dependencies are few, but all of them count
const everyRecord = async (client: Client, resource: string, filter: string) => {
  const records: Record<string, unknown>[] = []
  let pageToken = ''
  do {
    const page = await client.search(resource, { filter, pageSize: 100, ...(pageToken && { pageToken }) })
    records.push(...page.items)
    pageToken = page.nextPageToken
  } while (pageToken)
  return records
}

const narrowed = (filter: string, extra: string | undefined) => (extra === undefined ? filter : `(${filter}) AND (${extra})`)

/**
 * The records `record` must rank between, through the list API: the join records that hold its key on either side,
 * then the records they name, those it depends on narrowed to the pending ones. Without `after` on the resource's
 * position there are none.
 */
export const rankBounds = async (client: Client, model: ResourceModel, view: ViewModel | undefined, record: Record<string, unknown>): Promise<RankBounds> => {
  const after = model.position?.after
  if (!after) return { after: [], before: [] }
  const id = model.primaryKey[0]!
  // `after` takes a key of one field
  const self = recordKey(model, record) as string | number
  const encoded = (value: unknown) => encodeKey([value as string | number])
  const links = await everyRecord(client, after.resource, narrowed(printFilter(where.or(where.eq(after.field, self), where.eq(after.key, self))), after.filter))
  const other = (from: string, to: string) => links.flatMap((link) => (encoded(link[from]) === encoded(self) && encoded(link[to]) !== encoded(self) ? [link[to] as string | number] : []))
  const dependsOn = other(after.field, after.key)
  const dependents = other(after.key, after.field)

  const [pending, waiting] = await Promise.all([
    everyRecord(client, model.name, narrowed(printFilter(where.in(id, [self, ...dependsOn])), after.while)),
    dependents.length === 0 ? [] : everyRecord(client, model.name, printFilter(where.in(id, dependents))),
  ])
  const bound = (found: Record<string, unknown>): RankBound => {
    const key = encodeKey(recordKey(model, found))
    return { key, rank: found[model.position!.field], title: recordTitle(model, view, found, key) }
  }
  const selfPending = pending.some((found) => encoded(found[id]) === encoded(self))
  return { after: pending.filter((found) => encoded(found[id]) !== encoded(self)).map(bound), before: selfPending ? waiting.map(bound) : [] }
}
