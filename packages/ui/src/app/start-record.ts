import type { NavStartModel, ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import type { MetaData } from '../data/meta-data'
import { recordKey } from '../live/model-helpers'
import { defaultOrderBy } from './list-order'
import { navFromMeta } from './nav-from-meta'

export type StartEntry = { model: ResourceModel; start: NavStartModel }

/**
 * The sidebar entry whose view names the record the app opens at `/` (`nav.start`): the first in the sidebar's order
 * that the caller sees, so that the start follows what their roles show. None when no entry names one.
 */
export const startEntry = (meta: MetaData): StartEntry | undefined => {
  for (const item of navFromMeta(meta).flatMap((group) => group.items)) {
    const start = item.problem ? undefined : meta.views[item.id]?.nav?.start
    const model = meta.resources[item.id]
    if (start && model) return { model, start }
  }
  return
}

/** The list request that finds the start record: its filter, the order given or the list's sort, one row, its key alone. */
export const startRequest = ({ model, start }: StartEntry, meta: MetaData) => ({
  filter: start.filter,
  orderBy: start.orderBy ?? defaultOrderBy(model, meta.views[model.name]),
  pageSize: 1,
  fields: [...model.primaryKey],
})

/** The address key of the row the request found, or none when nothing matched. */
export const startKey = (model: ResourceModel, rows: Record<string, unknown>[]) => {
  const row = rows[0]
  return row && encodeKey(recordKey(model, row))
}
