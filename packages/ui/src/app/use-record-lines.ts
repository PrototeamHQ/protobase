import { useMemo } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { listColumnNames } from '../live/columns-from-model'
import { listLabels } from '../live/relation-labels'
import { keyValue } from './create/create-values'
import { useAdminMeta } from './meta-gate'
import { useLines } from './use-lines'
import { useLinesDraft } from './use-lines-draft'

/** A resource that holds numbered lines of this one: it points at the parent and has `position` and `quantity`. */
export const findLinesResource = (resources: Record<string, ResourceModel>, parent: ResourceModel) =>
  Object.values(resources).find(
    (candidate) =>
      candidate.name !== parent.name &&
      candidate.fields.position &&
      candidate.fields.quantity &&
      Object.values(candidate.fields).some((field) => field.type === 'relation' && field.relation?.resource === parent.name),
  )

/**
 * The lines' columns: the list columns of their view, or its first fields, without what the editor fills in itself:
 * the key, the tenant, the relation to the record and the position, which is the order of the rows.
 */
export const lineColumnNames = (lines: ResourceModel, view: ViewModel | undefined, link: string) =>
  listColumnNames(lines, view).filter((name) => {
    const field = lines.fields[name]
    return field && !field.writeOnly && name !== link && name !== 'position' && name !== lines.tenant && !lines.primaryKey.includes(name)
  })

/** The record's lines when it has a lines resource: the resource, its columns, the lines as stored and the changes made to them. */
export const useRecordLines = (parent: ResourceModel, parentKey: string) => {
  const { resources, views } = useAdminMeta()
  const model = useMemo(() => findLinesResource(resources, parent), [resources, parent])
  const link = model && Object.values(model.fields).find((field) => field.type === 'relation' && field.relation?.resource === parent.name)
  const columns = model && link ? lineColumnNames(model, views[model.name], link.name) : []
  const data = useLines(model, link, parentKey, model ? listLabels(resources, views, model, columns) : undefined)
  const target = useMemo(() => (model && link ? { model, position: 'position', link: { field: link.name, value: keyValue(parent, parentKey) } } : undefined), [model, link, parent, parentKey])
  const draft = useLinesDraft(target, data.items)
  return { model, columns, data, draft }
}

export type RecordLinesData = ReturnType<typeof useRecordLines>
