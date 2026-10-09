import type { NavRecord } from '../app-shell'
import { defaultRecentLimit, encodeKey, enumLabel, type NavRecentModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { recordKey, recordTitle, recordTitleField } from '../live/model-helpers'
import { defaultOrderBy } from './list-order'

/** The list request behind a sidebar group: its filter, order (the list's sort when unset), size, and only the fields it shows. */
export const recentRequest = (model: ResourceModel, view: ViewModel, recent: NavRecentModel) => ({
  filter: recent.filter ?? '',
  orderBy: recent.orderBy ?? defaultOrderBy(model, view),
  pageSize: recent.limit ?? defaultRecentLimit,
  fields: [...new Set([...model.primaryKey, recordTitleField(model, view), recent.status])],
})

/** List rows as sidebar records: titled like the record page, dotted by their status, active while open. */
export const recentRecords = (
  model: ResourceModel,
  view: ViewModel,
  recent: NavRecentModel,
  rows: Record<string, unknown>[],
  basePath: string,
  activeKey: string | undefined,
): NavRecord[] => {
  return rows.map((row) => {
    const key = encodeKey(recordKey(model, row))
    const status = String(row[recent.status] ?? '')
    return {
      id: key,
      label: recordTitle(model, view, row, key),
      href: `${basePath}/${model.name}/${encodeURIComponent(key)}`,
      status: model.fields[recent.status]?.type === 'enum' && status ? enumLabel(status, view.fields[recent.status]?.valueLabels) : status,
      tone: recent.tones[status] ?? 'neutral',
      pulse: recent.pulse?.includes(status) ?? false,
      active: key === activeKey,
    }
  })
}
