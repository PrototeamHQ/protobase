import { checkFilter, checkOrderBy, parseFilter, parseOrderBy, type ResourceModel } from '@protobase/schema'
import { elementResource } from './check-page'
import { countedResource, parseCondition } from './condition'
import { resolveFieldPath } from './field-path'
import type { LayoutNode } from './node'
import type { PageModel } from './page'
import { mapTree, type Scope } from './walk'

export type CallerAccess = {
  /** The resources the caller can do anything with, as restricted models: hidden fields absent, `readOnly` unless writable. */
  models: Record<string, ResourceModel>
  permissions: Record<string, { create: boolean; update: boolean }>
  /** The named actions in the caller's view of a resource. */
  actions: (resource: string) => ReadonlySet<string>
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

const filterFits = (model: ResourceModel, source: string | undefined) => {
  if (source === undefined) return true
  const parsed = parseFilter(source)
  return parsed.ok && (parsed.ast === undefined || checkFilter(model, parsed.ast).ok)
}

const sortFits = (model: ResourceModel, source: string | undefined) => {
  if (source === undefined) return true
  const parsed = parseOrderBy(source)
  return parsed.ok && checkOrderBy(model, parsed.items).ok
}

const writable = (model: ResourceModel, name: string) => Object.hasOwn(model.fields, name) && !model.fields[name]!.readOnly

const prune = (node: LayoutNode, scope: Scope, access: CallerAccess): LayoutNode | null => {
  if (node.custom) return node
  const { models } = access
  const own = text(node.props.resource)
  if (own !== undefined && !models[own]) return null
  const resource = elementResource(node, scope)
  const model = resource === undefined ? undefined : models[resource]
  if (own !== undefined && model && (!filterFits(model, text(node.props.filter)) || !sortFits(model, text(node.props.sort)))) return null
  const readable = (name: string) => scope.resource !== undefined && resolveFieldPath(models, scope.resource, name).ok

  switch (node.type) {
    case 'Field':
      return readable(String(node.props.name)) ? node : null
    case 'Stat':
      return text(node.props.field) === undefined || readable(String(node.props.field)) ? node : null
    case 'Progress':
      return [node.props.value, node.props.max].every((name) => typeof name !== 'string' || readable(name)) ? node : null
    case 'Table': {
      const columns = node.props.columns as string[] | undefined
      if (!columns || !model) return node
      const visible = columns.filter((name) => Object.hasOwn(model.fields, name))
      const { columns: _, ...props } = node.props
      return { ...node, props: visible.length > 0 ? { ...props, columns: visible } : props }
    }
    case 'ModalForm': {
      if (!model || resource === undefined) return null
      const allowed = node.props.mode === 'create' ? access.permissions[resource]?.create : access.permissions[resource]?.update
      if (!allowed) return null
      if (!Object.keys((node.props.values as Record<string, unknown> | undefined) ?? {}).every((name) => writable(model, name))) return null
      const fields = (node.props.fields as string[]).filter((name) => writable(model, name))
      return fields.length > 0 ? { ...node, props: { ...node.props, fields } } : null
    }
    case 'Action':
      return resource !== undefined && model && access.actions(resource).has(String(node.props.name)) ? node : null
    case 'Show': {
      const parsed = parseCondition(String(node.props.when))
      if (!parsed.ok) return null
      const record = scope.record && scope.resource !== undefined ? models[scope.resource] : undefined
      const known = parsed.paths.every((name) => {
        const counted = countedResource(name, (first) => Boolean(record && Object.hasOwn(record.fields, first)))
        return counted !== undefined ? Boolean(models[counted]) : readable(name)
      })
      return known ? node : null
    }
    default:
      return node
  }
}

/**
 * The page as one caller may see it, or `undefined` when its roles leave the caller out. Every element that names a
 * resource, field, filter, sort or action the caller cannot use is left out, with what it contains; table columns
 * and form fields are narrowed to what the caller may read and write. Data still comes from the API, which applies
 * the same access rules (row filters included) to every request.
 */
export const prunePage = (page: PageModel, roles: readonly string[], access: CallerAccess): PageModel | undefined => {
  if (page.roles && !page.roles.some((role) => roles.includes(role))) return undefined
  const tree = mapTree(page.tree, (node, { scope }) => prune(node, scope, access))
  return tree ? { ...page, tree } : undefined
}
