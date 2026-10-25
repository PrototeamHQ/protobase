import type { ResourceModel } from '@protobase/schema'
import type { LayoutNode } from './node'
import type { PageModel } from './page'
import { mapTree, walkTree } from './walk'

// What only the server sets on a person's settings record: its key, which is the owner, and the fields it keeps itself.
const setBySystem = (model: ResourceModel) => new Set([...model.primaryKey, model.owner, model.tenant, model.softDelete, model.position?.field])

/** The fields a `Settings` of `model` shows without `fields`: every one a person can set, in the model's order. */
export const settingsFields = (model: ResourceModel): string[] => {
  const system = setBySystem(model)
  return Object.entries(model.fields)
    .filter(([name, field]) => !system.has(name) && !field.readOnly && !field.sensitive && !field.file)
    .map(([name]) => name)
}

/**
 * What keeps `model` from holding settings: an owner that is its whole key, so each person has one record, and no
 * tenant, as settings are personal; and the `fields` it names.
 */
export const settingsProblems = (model: ResourceModel, fields: string[] | undefined): string[] => {
  const { name, owner, primaryKey, tenant } = model
  if (owner === undefined) return [`${name} has no .owner(...), so its records are not each person's own`]
  const problems: string[] = []
  if (primaryKey.length !== 1 || primaryKey[0] !== owner) problems.push(`the owner "${owner}" must be the key of ${name}, so each person has one record: .primaryKey((r) => r.${owner})`)
  if (tenant !== undefined) problems.push(`${name} has a tenant, and settings are each person's own: leave out .tenant()`)
  if (fields === undefined) {
    if (settingsFields(model).length === 0) problems.push(`${name} has no field a person can set`)
    return problems
  }
  const system = setBySystem(model)
  for (const field of fields) {
    const found = Object.hasOwn(model.fields, field) ? model.fields[field]! : undefined
    if (!found) problems.push(`unknown field "${field}" on ${name}`)
    else if (system.has(field)) problems.push(`"${field}" is set by the server on ${name}, so it is no setting`)
    else if (found.sensitive) problems.push(`"${field}" is sensitive, and Settings does not show sensitive fields`)
    else if (found.file) problems.push(`"${field}" is a file, and Settings does not upload files`)
  }
  return problems
}

const isSettings = (node: LayoutNode) => !node.custom && node.type === 'Settings' && typeof node.props.resource === 'string'

/** The resources the pages' `Settings` blocks show, which every caller reads and writes only their own records of. */
export const settingsResources = (pages: readonly PageModel[]): Set<string> => {
  const found = new Set<string>()
  for (const page of pages) walkTree(page.tree, (node) => void (isSettings(node) && found.add(String(node.props.resource))))
  return found
}

/** The page with each `Settings` without `fields` given its default fields, from the full models, before pruning. */
export const withSettingsFields = (page: PageModel, models: Record<string, ResourceModel>): PageModel => {
  const tree = mapTree(page.tree, (node) => {
    if (!isSettings(node) || node.props.fields !== undefined) return node
    const model = models[String(node.props.resource)]
    return model ? { ...node, props: { ...node.props, fields: settingsFields(model) } } : node
  })
  return { ...page, tree: tree! }
}
