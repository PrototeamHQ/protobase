import { useMemo } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { layoutItems } from '@protobase/schema/internal'
import { listColumnNames } from '../live/columns-from-model'
import { listLabels } from '../live/relation-labels'
import { keyValue } from './create/create-values'
import { useAdminMeta } from './meta-gate'
import { useLines } from './use-lines'
import { useLinesDraft } from './use-lines-draft'

/**
 * The record's lines, as its view declares them with `l.related(..., { lines: true })`: the section, the lines'
 * resource, the relation that points at the record and the field that orders them.
 */
export const findLinesResource = (resources: Record<string, ResourceModel>, view: ViewModel | undefined) => {
  const item = layoutItems(view?.layout ?? []).find((each) => each.kind === 'related' && each.lines === true)
  if (item?.kind !== 'related') return
  const model = resources[item.resource]
  const link = model?.fields[item.field]
  const position = model?.position?.field
  if (!model || !link || !position || model.position?.within !== item.field) return
  return { item, model, link, position }
}

/**
 * The lines' columns: the list columns of their view, or its first fields, without what the editor fills in itself:
 * the key, the tenant, the relation to the record and the position, which is the order of the rows.
 */
export const lineColumnNames = (lines: ResourceModel, view: ViewModel | undefined, link: string, position: string) =>
  listColumnNames(lines, view).filter((name) => {
    const field = lines.fields[name]
    return field && !field.writeOnly && name !== link && name !== position && name !== lines.tenant && !lines.primaryKey.includes(name)
  })

/** The record's lines when its view declares them: the section, the resource, its columns, the lines as stored and the changes made to them. */
export const useRecordLines = (parent: ResourceModel, parentKey: string) => {
  const { resources, views } = useAdminMeta()
  const found = useMemo(() => findLinesResource(resources, views[parent.name]), [resources, views, parent])
  const model = found?.model
  const columns = found ? lineColumnNames(found.model, views[found.model.name], found.link.name, found.position) : []
  const data = useLines(model, found?.link, found?.position, parentKey, model ? listLabels(resources, views, model, columns) : undefined)
  const target = useMemo(() => (found ? { model: found.model, position: found.position, link: { field: found.link.name, value: keyValue(parent, parentKey) } } : undefined), [found, parent, parentKey])
  const draft = useLinesDraft(target, data.items)
  return { item: found?.item, model, columns, data, draft }
}

export type RecordLinesData = ReturnType<typeof useRecordLines>
