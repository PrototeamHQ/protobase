import type { NavRecord } from '../app-shell'
import { appPath, enumLabel, type NavRecentModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { defaultRecentLimit, encodeKey } from '@protobase/schema/internal'
import { recordKey, recordTitle, recordTitleField } from '../live/model-helpers'
import { defaultOrderBy } from './list-order'

/** The list request behind a sidebar group: its filter, order (the list's sort when unset), size, and only the fields it shows. */
export const recentRequest = (model: ResourceModel, view: ViewModel, recent: NavRecentModel) => ({
  filter: recent.filter ?? '',
  orderBy: recent.orderBy ?? defaultOrderBy(model, view),
  pageSize: recent.limit ?? defaultRecentLimit,
  fields: [...new Set([...model.primaryKey, recordTitleField(model, view), ...(recent.status === undefined ? [] : [recent.status])])],
})

// A record's status as shown, with its dot's tone and pulse; none in a group without a status field.
const recordStatus = (model: ResourceModel, view: ViewModel, recent: NavRecentModel, row: Record<string, unknown>) => {
  if (recent.status === undefined) return
  const value = String(row[recent.status] ?? '')
  return {
    label: model.fields[recent.status]?.type === 'enum' && value ? enumLabel(value, view.fields[recent.status]?.valueLabels) : value,
    tone: recent.tones?.[value] ?? 'neutral',
    pulse: recent.pulse?.includes(value) ?? false,
  }
}

/** List rows as sidebar records: titled like the record page, dotted by their status when the group has one, active while open. */
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
    const status = recordStatus(model, view, recent, row)
    return {
      id: key,
      label: recordTitle(model, view, row, key),
      href: appPath({ kind: 'record', resource: model.name, key }, basePath),
      ...(status && { status }),
      active: key === activeKey,
    }
  })
}

/** Whether a record read anew differs from its row in a sidebar group on the fields the group shows: the group is then out of date. */
export const recentRowDiffers = (model: ResourceModel, fields: string[], rows: Record<string, unknown>[], key: string, record: Record<string, unknown>) => {
  const row = rows.find((entry) => encodeKey(recordKey(model, entry)) === key)
  return row !== undefined && fields.some((field) => !Object.is(row[field], record[field]))
}
