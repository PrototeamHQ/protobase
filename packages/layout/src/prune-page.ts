import { checkOrderBy, parseOrderBy, type AppAddress, type ResourceModel, type RowButtonModel } from '@protobase/schema'
import { addressErrors, followableRowButton, pruneByShape, shapes } from '@protobase/schema/internal'
import { chartFields } from './check-chart'
import { threadFields } from './check-conversation'
import { scopedConditionReadable } from './check-condition'
import { listModelProblems } from './check-list-models'
import { pathFindings } from './check-paths'
import { pruneToolCalls, type ToolCallSource } from './check-tool-calls'
import { elementResource, linkPlaceholderError, pageParams } from './check-page'
import { resolveFieldPath } from './field-path'
import { inlineFieldTypes } from './inline-fields'
import { sampledFilterErrors } from './sampled-filter'
import { resolveScopePath } from './scope-lookup'
import { dataProps, type LayoutNode, type LayoutValue } from './node'
import type { PageModel } from './page'
import { columnName, type TableColumn } from './table-columns'
import { innermost, mapTree, type Scope } from './walk'

export type CallerAccess = {
  /** The resources the caller can do anything with, as restricted models: hidden fields absent, `readOnly` unless writable. */
  models: Record<string, ResourceModel>
  permissions: Record<string, { create: boolean; update: boolean }>
  /** The named actions in the caller's view of a resource. */
  actions: (resource: string) => ReadonlySet<string>
  /** The resources whose view for the caller opens a create page, which a create link may give values of any name. */
  createPages?: ReadonlySet<string>
  /** Whether the caller may call an API function, which an `Image` draws; without it, no image is kept. */
  functions?: (name: string) => boolean
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

// A filter's `{{path}}` slots stand in for values, which the page fills in, so its names are what the caller must read.
const filterFits = (model: ResourceModel, source: string | undefined) => source === undefined || sampledFilterErrors(model, source).length === 0

const sortFits = (model: ResourceModel, source: string | undefined) => {
  if (source === undefined) return true
  const parsed = parseOrderBy(source)
  return parsed.ok && checkOrderBy(model, parsed.items).ok
}

const writable = (model: ResourceModel, name: string) => Object.hasOwn(model.fields, name) && !model.fields[name]!.readOnly

// A custom component's props are the project's; the resource it names and the field references in them are the
// framework's, read through the same walker as a view's custom props.
const pruneCustom = (node: LayoutNode, scope: Scope, { models }: CallerAccess): LayoutNode | null => {
  const own = text(node.props.resource)
  if (own !== undefined && !models[own]) return null
  const resource = elementResource(node, scope)
  const readable = (path: string) => resource !== undefined && resolveFieldPath(models, resource, path).ok
  return pruneByShape(dataProps(node), shapes.refs, readable) === undefined ? null : node
}

const prune = (node: LayoutNode, scope: Scope, access: CallerAccess, params: ReadonlySet<string>): LayoutNode | null => {
  if (node.custom) return pruneCustom(node, scope, access)
  const { models } = access
  const own = text(node.props.resource)
  if (own !== undefined && !models[own]) return null
  const resource = elementResource(node, scope)
  const model = resource === undefined ? undefined : models[resource]
  if (own !== undefined && model && (!filterFits(model, text(node.props.filter)) || !sortFits(model, text(node.props.sort)))) return null
  // A `{{path}}` the caller cannot read leaves the element out, as a field they cannot read does
  if (pathFindings(node, scope, { models, params }).problems.length > 0) return null
  const readable = (name: string) => innermost(scope) !== undefined && resolveScopePath(name, { models, scope, params, mode: 'relations' }).ok
  const conditionFits = (when: unknown) => typeof when === 'string' && scopedConditionReadable(when, { models, scope, params })

  if (inlineFieldTypes.has(node.type)) return readable(String(node.props.source)) ? node : null
  switch (node.type) {
    // A list or record the caller cannot read by its target, source, filter or sort is left out, with what it holds
    case 'ReferenceManyField':
    case 'ReferenceArrayField':
    case 'ArrayField':
    case 'ReferenceField':
      return listModelProblems(node, scope, { models, params }).length > 0 ? null : node
    case 'Field':
      return readable(String(node.props.source)) ? node : null
    case 'Stat':
      return text(node.props.field) === undefined || readable(String(node.props.field)) ? node : null
    case 'Chart':
      return model && chartFields(node).every((name) => Object.hasOwn(model.fields, name)) ? node : null
    // A thread needs every field of its messages, and drops a status line, working indicator or tool calls the caller
    // cannot read; a composer needs to create one with its text and values.
    case 'Thread': {
      if (!model || !threadFields(node).every((name) => Object.hasOwn(model.fields, name))) return null
      const { status, working, calls, ...props } = node.props
      const keepsStatus = typeof status === 'string' && Object.hasOwn(model.fields, status)
      const keepsWorking = conditionFits(working)
      const keptCalls = calls === undefined ? undefined : pruneToolCalls(calls as unknown as ToolCallSource, models)
      return { ...node, props: { ...props, ...(keepsStatus && { status }), ...(keepsWorking && { working }), ...(keptCalls && { calls: keptCalls }) } }
    }
    case 'Composer': {
      if (!model || resource === undefined || !access.permissions[resource]?.create) return null
      const names = [String(node.props.field), ...Object.keys((node.props.values as Record<string, unknown> | undefined) ?? {})]
      return names.every((name) => writable(model, name)) ? node : null
    }
    case 'Progress':
      return [node.props.value, node.props.max].every((name) => typeof name !== 'string' || readable(name)) ? node : null
    // Columns narrow to what the caller can read; a row button's choice goes when it reads what they cannot or leads where they cannot go.
    case 'Table': {
      if (!model) return node
      const { columns, button, ...props } = node.props
      const visible = (columns as TableColumn[] | undefined)?.filter((column) => Object.hasOwn(model.fields, columnName(column))) ?? []
      // The button was checked when the config loaded, so it is a row button's shape
      const followable = button === undefined ? undefined : followableRowButton(button as RowButtonModel, model, { models, createPages: access.createPages })
      return { ...node, props: { ...props, ...(visible.length > 0 && { columns: visible as LayoutValue }), ...(followable !== undefined && { button: followable as LayoutValue }) } }
    }
    case 'RecordCards': {
      if (!model || own === undefined) return node
      const fields = node.props.fields as string[] | undefined
      const cardActions = node.props.cardActions as string[] | undefined
      const props = {
        ...node.props,
        ...(fields && { fields: fields.filter((name) => resolveFieldPath(models, own, name).ok) }),
        ...(cardActions && { cardActions: cardActions.filter((name) => access.actions(own).has(name)) }),
      }
      return { ...node, props }
    }
    case 'ModalForm': {
      if (!model || resource === undefined) return null
      const allowed = node.props.mode === 'create' ? access.permissions[resource]?.create : access.permissions[resource]?.update
      if (!allowed) return null
      if (!Object.keys((node.props.values as Record<string, unknown> | undefined) ?? {}).every((name) => writable(model, name))) return null
      const fields = (node.props.fields as string[]).filter((name) => writable(model, name))
      return fields.length > 0 ? { ...node, props: { ...node.props, fields } } : null
    }
    // What the caller cannot read is left out, and what they cannot write shows as a value.
    case 'Settings': {
      if (!model) return null
      const fields = ((node.props.fields as string[] | undefined) ?? []).filter((name) => Object.hasOwn(model.fields, name))
      return fields.length > 0 ? { ...node, props: { ...node.props, fields } } : null
    }
    case 'Action':
      return resource !== undefined && model && access.actions(resource).has(String(node.props.name)) ? node : null
    // A fixed picture is anyone's; a function's only for who may call it.
    case 'Image':
      return node.props.function === undefined || access.functions?.(String(node.props.function)) ? node : null
    case 'Link':
      return node.props.to === undefined || addressErrors(node.props.to as AppAddress, { models, placeholderError: linkPlaceholderError(models, scope, params), createPages: access.createPages }).length === 0 ? node : null
    // A condition the caller cannot read leaves out what it decides; a Switch goes whole, so no later branch stands in
    case 'Show':
      return conditionFits(node.props.when) ? node : null
    case 'Switch':
      return node.children.every((child) => typeof child === 'string' || conditionFits(child.props.when)) ? node : null
    // A tab whose every element is left out has nothing to show, and tabs without one are left out too.
    case 'Tab':
    case 'Tabs':
      return node.children.length > 0 ? node : null
    default:
      return node
  }
}

/**
 * The page as one caller may see it, or `undefined` when its roles leave the caller out. Every element that names a
 * resource, field, filter, sort or action the caller cannot use is left out, with what it contains, custom components
 * by their `resource` and field references (`fieldRef`) too, and so is a tab left with nothing in it; table columns and
 * form fields are narrowed to what the caller may read and write. Data still comes from the API, which applies the same
 * access rules (row filters included) to every request.
 */
export const prunePage = (page: PageModel, roles: readonly string[], access: CallerAccess): PageModel | undefined => {
  if (page.roles && !page.roles.some((role) => roles.includes(role))) return undefined
  const params = pageParams(page.tree)
  const tree = mapTree(page.tree, (node, { scope }) => prune(node, scope, access, params))
  return tree ? { ...page, tree } : undefined
}
