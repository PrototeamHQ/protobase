import { resolveFieldPath } from '@protobase/layout'
import { addressErrors, type ActionModel, type FieldModel, type LayoutItemModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import type { Meta, ResourcePermissions, SourceRef } from './types'

/** What the app draws of a source: the resources it lists that the user may see there, their views and what the user may do. */
export type SourceMeta = { resources: ResourceModel[]; views: ViewModel[]; permissions: Record<string, ResourcePermissions> }

// A relation to a resource the app does not draw from the source shows its key: the app has no such resource, or one of
// its own by that name, which is another resource.
const withinSource = (model: ResourceModel, drawn: Record<string, ResourceModel>): ResourceModel => ({
  ...model,
  fields: Object.fromEntries(
    Object.entries(model.fields).map(([name, field]): [string, FieldModel] => {
      if (!field.relation || Object.hasOwn(drawn, field.relation.resource)) return [name, field]
      const { relation: _outside, ...plain } = field
      return [name, plain]
    }),
  ),
})

// Related records of a resource the app does not draw go, and so do columns that go through a relation out of the source.
const keptLayoutItem = (item: LayoutItemModel, models: Record<string, ResourceModel>): LayoutItemModel[] => {
  if (item.kind !== 'related') return [item]
  if (!Object.hasOwn(models, item.resource) || (item.through && !Object.hasOwn(models, item.through.resource))) return []
  const { columns, ...rest } = item
  const kept = columns?.filter((column) => resolveFieldPath(models, item.resource, column).ok)
  return [kept && kept.length > 0 ? { ...rest, columns: kept } : rest]
}

// A link to an address in the app goes when it leads out of the source: to a page, or to a resource the app does not draw.
const keptAction = (action: ActionModel, model: ResourceModel, models: Record<string, ResourceModel>) =>
  action.run?.kind !== 'link' || !('to' in action.run) || addressErrors(action.run.to, { models, pages: new Set(), source: model }).length === 0

const withinSourceView = (view: ViewModel, models: Record<string, ResourceModel>): ViewModel => ({
  ...view,
  layout: view.layout.flatMap((item) => keptLayoutItem(item, models)),
  actions: view.actions.filter((action) => keptAction(action, models[view.resource]!, models)),
})

/**
 * The part of a source's `/meta` the app draws: the resources `source` lists, of those the source names to the user,
 * with their views and permissions. Nothing in them leads out of the source: a relation to a resource the app does not
 * draw from it shows its key, and related records of one, columns through one and links to one or to a page go.
 */
export const sourceMeta = (meta: Meta, source: SourceRef): SourceMeta => {
  const listed = meta.resources.filter((model) => source.resources.includes(model.name))
  const models: Record<string, ResourceModel> = Object.fromEntries(listed.map((model) => [model.name, model]))
  const resources = listed.map((model) => withinSource(model, models))
  const scoped = Object.fromEntries(resources.map((model) => [model.name, model]))
  const views = meta.views.filter((view) => Object.hasOwn(scoped, view.resource)).map((view) => withinSourceView(view, scoped))
  const permissions = Object.fromEntries(listed.flatMap((model) => (meta.permissions?.[model.name] ? [[model.name, meta.permissions[model.name]!]] : [])))
  return { resources, views, permissions }
}
