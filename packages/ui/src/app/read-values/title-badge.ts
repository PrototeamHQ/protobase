import type { ResourceModel, ViewModel } from '@protobase/schema'

/**
 * The field whose value shows as a badge beside a record page's title: the view's `titleBadge`, else an enum `status`
 * the sidebar does not show already. None when the field is not `visible` to the reader or holds no value.
 */
export const titleBadgeField = (model: ResourceModel, view: ViewModel | undefined, record: Record<string, unknown>, sidebarFields: readonly string[], visible: (name: string) => boolean) => {
  const status = model.fields.status?.type === 'enum' && !sidebarFields.includes('status') ? 'status' : undefined
  const name = view?.titleBadge ?? status
  if (name === undefined || !model.fields[name] || !visible(name)) return
  const value = record[name]
  if (value === null || value === undefined || value === '') return
  return name
}
