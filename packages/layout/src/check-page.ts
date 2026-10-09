import { checkFilter, checkOrderBy, parseFilter, parseOrderBy, type ResourceModel } from '@protobase/schema'
import { countedResource, parseCondition } from './condition'
import { resolveFieldPath } from './field-path'
import type { LayoutNode } from './node'
import type { PageModel } from './page'
import { walkTree, type Scope } from './walk'

export type PageCheckInput = {
  models: Record<string, ResourceModel>
  /** The named actions of a resource, from all of its views. */
  actions: (resource: string) => ReadonlySet<string>
}

const filterProblem = (model: ResourceModel, source: string) => {
  const parsed = parseFilter(source)
  if (!parsed.ok) return parsed.errors.map((error) => error.message).join('; ')
  if (!parsed.ast) return undefined
  const checked = checkFilter(model, parsed.ast)
  return checked.ok ? undefined : checked.errors.map((error) => error.message).join('; ')
}

const sortProblem = (model: ResourceModel, source: string) => {
  const parsed = parseOrderBy(source)
  if (!parsed.ok) return parsed.errors.map((error) => error.message).join('; ')
  const checked = checkOrderBy(model, parsed.items)
  return checked.ok ? undefined : checked.errors.map((error) => error.message).join('; ')
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

/** The resource an element reads or writes: its own `resource` prop, or the record around it. */
export const elementResource = (node: LayoutNode, scope: Scope) => text(node.props.resource) ?? (scope.record ? scope.resource : undefined)

const nodeProblems = (node: LayoutNode, scope: Scope, { models, actions }: PageCheckInput): string[] => {
  const problems: string[] = []
  const resource = elementResource(node, scope)
  const own = text(node.props.resource)
  if (own !== undefined && !models[own]) return [`unknown resource "${own}"`]
  const model = resource === undefined ? undefined : models[resource]
  const path = (name: string, from = scope.resource) => {
    if (from === undefined) return
    const resolved = resolveFieldPath(models, from, name)
    if (!resolved.ok) problems.push(resolved.message)
  }
  if (own !== undefined && model) {
    const filter = text(node.props.filter)
    const sort = text(node.props.sort)
    const filterError = filter === undefined ? undefined : filterProblem(model, filter)
    const sortError = sort === undefined ? undefined : sortProblem(model, sort)
    if (filterError) problems.push(`filter: ${filterError}`)
    if (sortError) problems.push(`sort: ${sortError}`)
  }
  switch (node.type) {
    case 'Field':
      path(String(node.props.name))
      break
    case 'Stat':
      if (text(node.props.field) !== undefined) path(String(node.props.field))
      break
    case 'Progress':
      for (const name of [node.props.value, node.props.max]) if (typeof name === 'string') path(name)
      break
    case 'Table':
      for (const column of (node.props.columns as string[] | undefined) ?? []) {
        if (model && !Object.hasOwn(model.fields, column)) problems.push(`unknown column "${column}" on ${model.name}`)
      }
      break
    case 'ModalForm':
      if (!model) break
      for (const name of node.props.fields as string[]) {
        const field = Object.hasOwn(model.fields, name) ? model.fields[name] : undefined
        if (!field) problems.push(`unknown field "${name}" on ${model.name}`)
        else if (field.readOnly || name === model.tenant) problems.push(`"${name}" is read-only on ${model.name}, so a form cannot set it`)
      }
      for (const name of Object.keys((node.props.values as Record<string, unknown> | undefined) ?? {})) {
        if (!Object.hasOwn(model.fields, name)) problems.push(`values: unknown field "${name}" on ${model.name}`)
      }
      break
    case 'Action':
      if (resource !== undefined && !actions(resource).has(String(node.props.name))) {
        problems.push(`no action "${node.props.name}" on ${resource}; declare it with view('${resource}').actions(...)`)
      }
      break
    case 'Show': {
      const parsed = parseCondition(String(node.props.when))
      if (!parsed.ok) break
      const record = scope.record && scope.resource !== undefined ? models[scope.resource] : undefined
      for (const name of parsed.paths) {
        const counted = countedResource(name, (first) => Boolean(record && Object.hasOwn(record.fields, first)))
        if (counted !== undefined) {
          if (!models[counted]) problems.push(`"when" counts "${counted}", which is not a resource`)
        } else if (record) {
          path(name)
        } else {
          problems.push(`"when" names "${name}", but outside a record it can only count records, as "<resource>.count"`)
        }
      }
      break
    }
  }
  return problems
}

/** Everything a page names that the models do not have: resources, fields, filters, sorts, actions and conditions. */
export const pageProblems = (page: PageModel, input: PageCheckInput): string[] => {
  const problems: string[] = []
  walkTree(page.tree, (node, { path, scope }) => {
    if (node.custom) return
    for (const problem of nodeProblems(node, scope, input)) problems.push(`${path}: ${problem}`)
  })
  return problems
}

/** Throws one error listing every problem of every page, including names that collide with each other or a resource. */
export const checkPages = (pages: PageModel[], input: PageCheckInput) => {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const page of pages) {
    if (seen.has(page.name)) problems.push(`Page "${page.name}" is defined twice`)
    if (input.models[page.name]) problems.push(`Page "${page.name}" has the name of a resource; both would be at /${page.name}`)
    seen.add(page.name)
    for (const problem of pageProblems(page, input)) problems.push(`Page "${page.name}": ${problem}`)
  }
  if (problems.length > 0) throw new Error(`The pages do not match the resources:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
}
