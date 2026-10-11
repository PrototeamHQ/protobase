import { resolveFieldPath } from '@protobase/layout'
import { addressErrors, hrefPlaceholders, navRecentErrors, type LayoutItemModel, type RelatedModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { relatedErrors } from './view-related'

// Columns narrow to what the caller can read; a section whose resources, fields, filter or sort they cannot use goes.
const pruneRelated = (item: RelatedModel, resource: string, models: Record<string, ResourceModel>): RelatedModel[] => {
  const { columns, ...rest } = item
  const visible = models[item.resource] ? columns?.filter((column) => resolveFieldPath(models, item.resource, column).ok) : undefined
  const narrowed = visible && visible.length > 0 ? { ...rest, columns: visible } : rest
  return relatedErrors(narrowed, resource, models).length === 0 ? [narrowed] : []
}

/**
 * The view with every reference to a field the caller cannot read removed: columns, sort, search, field labels,
 * filter widgets, layout, chart, title, search result, the update actions that set one and the links that read one or
 * lead where the caller cannot go, and the sidebar's `recent` group
 * when its status, filter or order uses a hidden field. Nothing in it may name a hidden field. Related sections are checked against
 * `models`, the caller's view of every resource.
 */
export const pruneView = (view: ViewModel, model: ResourceModel, models: Record<string, ResourceModel>): ViewModel => {
  const visible = (name: string) => Object.hasOwn(model.fields, name)
  const { title, chart, list, nav, searchResult, ...rest } = view
  const { recent, ...placement } = nav ?? {}
  const resultTitle = searchResult?.title?.filter(visible)
  const subtitle = searchResult?.subtitle
  return {
    ...rest,
    ...(searchResult && {
      searchResult: { ...(resultTitle?.length && { title: resultTitle }), ...(subtitle !== undefined && visible(subtitle) && { subtitle }) },
    }),
    ...(nav && { nav: recent && navRecentErrors(recent, model).length === 0 ? nav : placement }),
    ...(title !== undefined && visible(title) && { title }),
    ...(chart && visible(chart.field) && { chart }),
    ...(list && {
      list: {
        columns: list.columns.filter(visible),
        ...(list.sort && { sort: list.sort.filter(([name]) => visible(name)) }),
        ...(list.search && { search: list.search.filter(visible) }),
      },
    }),
    fields: Object.fromEntries(Object.entries(view.fields).filter(([name]) => visible(name))),
    filters: view.filters.filter((widget) => visible(widget.field)),
    actions: view.actions.filter(({ run }) => {
      if (run?.kind === 'update') return Object.keys(run.values).every(visible)
      if (run?.kind !== 'link') return true
      return 'to' in run ? addressErrors(run.to, { models, source: model }).length === 0 : hrefPlaceholders(run.href).every(visible)
    }),
    layout: view.layout.flatMap((item): LayoutItemModel[] => {
      if (item.kind === 'related') return pruneRelated(item, view.resource, models)
      const fields = item.fields.filter(visible)
      return fields.length > 0 ? [{ ...item, fields }] : []
    }),
  }
}
