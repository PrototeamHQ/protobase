import { checkFilter, checkOrderBy, parseFilter, parseOrderBy, type AppAddress, type ResourceModel } from '@protobase/schema'
import { addressErrors, fieldRefsIn } from '@protobase/schema/internal'
import { chartProblems } from './check-chart'
import { conditionProblems } from './check-condition'
import { resolveFieldPath } from './field-path'
import { dataProps, type LayoutNode } from './node'
import type { PageModel } from './page'
import { walkTree, type Scope } from './walk'

export type PageCheckInput = {
  models: Record<string, ResourceModel>
  /** The named actions of a resource, from all of its views. */
  actions: (resource: string) => ReadonlySet<string>
  /** The composed pages' names, which links may go to; `checkPages` fills them in. */
  pages?: ReadonlySet<string>
  /** The resources whose view opens a create page, which a create link may give values of any name. */
  createPages?: ReadonlySet<string>
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

/** The record a link's `{field}` placeholders read: the one around it, when there is one. */
export const linkSource = (models: Record<string, ResourceModel>, scope: Scope) => (scope.record && scope.resource !== undefined ? models[scope.resource] : undefined)

const nodeProblems = (node: LayoutNode, scope: Scope, { models, actions, pages, createPages }: PageCheckInput): string[] => {
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
    case 'Chart':
      if (model) problems.push(...chartProblems(node, model))
      break
    case 'Progress':
      for (const name of [node.props.value, node.props.max]) if (typeof name === 'string') path(name)
      break
    case 'Table':
      for (const column of (node.props.columns as string[] | undefined) ?? []) {
        if (model && !Object.hasOwn(model.fields, column)) problems.push(`unknown column "${column}" on ${model.name}`)
      }
      break
    case 'RecordCards':
      for (const name of (node.props.fields as string[] | undefined) ?? []) path(name, own)
      for (const name of (node.props.cardActions as string[] | undefined) ?? []) {
        if (own !== undefined && !actions(own).has(name)) problems.push(`no action "${name}" on ${own}; declare it with view('${own}').actions(...)`)
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
    case 'Link':
      if (node.props.to !== undefined) problems.push(...addressErrors(node.props.to as AppAddress, { models, pages, source: linkSource(models, scope), createPages }).map((error) => `to: ${error}`))
      break
    case 'Show':
      problems.push(...conditionProblems(String(node.props.when), scope.record ? scope.resource : undefined, models))
      break
  }
  return problems
}

// A custom component's `resource` names a resource, and its field references fields of that or the record around it.
const customProblems = (node: LayoutNode, scope: Scope, { models }: PageCheckInput): string[] => {
  const own = text(node.props.resource)
  if (own !== undefined && !models[own]) return [`unknown resource "${own}"`]
  const resource = elementResource(node, scope)
  return fieldRefsIn(dataProps(node)).flatMap((path) => {
    if (resource === undefined) return [`field reference "${path}" needs a record around it, or a "resource" prop`]
    const resolved = resolveFieldPath(models, resource, path)
    return resolved.ok ? [] : [resolved.message]
  })
}

/** Everything a page names that the models do not have: resources, fields, filters, sorts, actions and conditions. */
export const pageProblems = (page: PageModel, input: PageCheckInput): string[] => {
  const problems: string[] = []
  walkTree(page.tree, (node, { path, scope }) => {
    const found = node.custom ? customProblems(node, scope, input) : nodeProblems(node, scope, input)
    for (const problem of found) problems.push(`${path}: ${problem}`)
  })
  return problems
}

/** Throws one error listing every problem of every page, including names that collide with each other or a resource. */
export const checkPages = (pages: PageModel[], input: PageCheckInput) => {
  const problems: string[] = []
  const seen = new Set<string>()
  const named = { ...input, pages: input.pages ?? new Set(pages.map((page) => page.name)) }
  for (const page of pages) {
    if (seen.has(page.name)) problems.push(`Page "${page.name}" is defined twice`)
    if (input.models[page.name]) problems.push(`Page "${page.name}" has the name of a resource; both would be at /${page.name}`)
    seen.add(page.name)
    for (const problem of pageProblems(page, named)) problems.push(`Page "${page.name}": ${problem}`)
  }
  if (problems.length > 0) throw new Error(`The pages do not match the resources:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
}
