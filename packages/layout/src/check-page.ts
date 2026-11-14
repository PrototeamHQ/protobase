import { checkOrderBy, parseOrderBy, type AppAddress, type ResourceModel } from '@protobase/schema'
import { addressErrors, fieldRefsIn, rowButtonErrors } from '@protobase/schema/internal'
import { chartProblems } from './check-chart'
import { conditionFindings } from './check-condition'
import { composerProblems, threadProblems } from './check-conversation'
import { pathFindings } from './check-paths'
import { resolveFieldPath } from './field-path'
import { sampledFilterErrors } from './sampled-filter'
import { resolveScopePath } from './scope-lookup'
import { settingsProblems } from './settings'
import { columnName, type TableColumn } from './table-columns'
import { dataProps, type LayoutNode } from './node'
import type { PageModel } from './page'
import { innermost, walkTree, type Scope } from './walk'

export type PageCheckInput = {
  models: Record<string, ResourceModel>
  /** The named actions of a resource, from all of its views. */
  actions: (resource: string) => ReadonlySet<string>
  /** The composed pages' names, which links may go to; `checkPages` fills them in. */
  pages?: ReadonlySet<string>
  /** The resources whose view opens a create page, which a create link may give values of any name. */
  createPages?: ReadonlySet<string>
  /** The app's API functions, which an `Image` draws; its function goes unchecked without them. */
  functions?: ReadonlySet<string>
  /** Whether a name a nearer record shadows fails the check, as `protobase build --strict` makes it, instead of warning. */
  strict?: boolean
}

// A filter with `{{path}}` slots is checked with a stand-in for each.
const filterProblem = (model: ResourceModel, source: string) => {
  const errors = sampledFilterErrors(model, source)
  return errors.length === 0 ? undefined : errors.join('; ')
}

const sortProblem = (model: ResourceModel, source: string) => {
  const parsed = parseOrderBy(source)
  if (!parsed.ok) return parsed.errors.map((error) => error.message).join('; ')
  const checked = checkOrderBy(model, parsed.items)
  return checked.ok ? undefined : checked.errors.map((error) => error.message).join('; ')
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

/** The resource an element reads or writes: its own `resource` prop, or the record nearest around it. */
export const elementResource = (node: LayoutNode, scope: Scope) => text(node.props.resource) ?? innermost(scope)?.resource

/** Why a link's `{{path}}` cannot be filled where it sits, through the records around it; `undefined` when it can. */
export const linkPlaceholderError = (models: Record<string, ResourceModel>, scope: Scope, params: ReadonlySet<string>) => (path: string) => {
  const resolved = resolveScopePath(path, { models, scope, params, mode: 'stored' })
  return resolved.ok ? undefined : resolved.message
}

/** The page parameters the page's `SelectInput`s declare, which `@params.<name>` reads. */
export const pageParams = (tree: LayoutNode) => {
  const params = new Set<string>()
  walkTree(tree, (node) => {
    if (!node.custom && node.type === 'SelectInput' && typeof node.props.source === 'string') params.add(node.props.source)
  })
  return params
}

type NodeInput = PageCheckInput & { params: ReadonlySet<string>; warn: (warning: string) => void }

const nodeProblems = (node: LayoutNode, scope: Scope, input: NodeInput): string[] => {
  const { models, actions, pages, createPages, functions, params, warn } = input
  const problems: string[] = []
  const resource = elementResource(node, scope)
  const own = text(node.props.resource)
  if (own !== undefined && !models[own]) return [`unknown resource "${own}"`]
  const model = resource === undefined ? undefined : models[resource]
  const placed = pathFindings(node, scope, { models, params })
  problems.push(...placed.problems)
  placed.warnings.forEach(warn)
  // A field a block shows is found through the records around it, as a bare name in Mustache is
  const path = (name: string) => {
    if (innermost(scope) === undefined) return
    const resolved = resolveScopePath(name, { models, scope, params, mode: 'relations' })
    if (!resolved.ok) problems.push(resolved.message)
    else if (resolved.kind === 'field' && resolved.shadows) warn(resolved.shadows)
  }
  const condition = (when: string, prefix = '') => {
    const found = conditionFindings(when, { models, scope, params })
    problems.push(...found.problems.map((problem) => `${prefix}${problem}`))
    found.warnings.forEach((warning) => warn(`${prefix}${warning}`))
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
      for (const column of ((node.props.columns as TableColumn[] | undefined) ?? []).map(columnName)) {
        if (model && !Object.hasOwn(model.fields, column)) problems.push(`unknown column "${column}" on ${model.name}`)
      }
      if (model && node.props.button !== undefined) problems.push(...rowButtonErrors(node.props.button, model, { models, pages, createPages }).map((error) => `button: ${error}`))
      break
    case 'RecordCards':
      if (node.props.cardWidth !== undefined && node.props.layout !== 'carousel') problems.push(`"cardWidth" sizes the cards of a carousel; set layout to 'carousel' or leave it out`)
      for (const name of (node.props.fields as string[] | undefined) ?? []) {
        const resolved = own === undefined ? undefined : resolveFieldPath(models, own, name)
        if (resolved && !resolved.ok) problems.push(resolved.message)
      }
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
    case 'Thread':
      if (model) problems.push(...threadProblems(node, models, model))
      if (node.props.working !== undefined) condition(String(node.props.working), 'working: ')
      break
    case 'Composer':
      if (model) problems.push(...composerProblems(node, model))
      break
    case 'Settings':
      if (model) problems.push(...settingsProblems(model, node.props.fields as string[] | undefined))
      break
    case 'Action':
      if (resource !== undefined && !actions(resource).has(String(node.props.name))) {
        problems.push(`no action "${node.props.name}" on ${resource}; declare it with view('${resource}').actions(...)`)
      }
      break
    case 'Image':
      if (functions && node.props.function !== undefined && !functions.has(String(node.props.function))) problems.push(`no function "${node.props.function}"; add functions/${node.props.function}.ts`)
      break
    case 'Link':
      if (node.props.to !== undefined) problems.push(...addressErrors(node.props.to as AppAddress, { models, pages, placeholderError: linkPlaceholderError(models, scope, params), createPages }).map((error) => `to: ${error}`))
      break
    case 'Show':
    case 'Match':
      condition(String(node.props.when))
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

/**
 * Everything a page names that the models do not have: resources, fields, filters, sorts, actions, conditions and
 * placeholders; and the warnings of bare names a nearer record shadows.
 */
export const pageFindings = (page: PageModel, input: PageCheckInput): { problems: string[]; warnings: string[] } => {
  const problems: string[] = []
  const warnings: string[] = []
  const params = pageParams(page.tree)
  walkTree(page.tree, (node, { path, scope }) => {
    const warn = (warning: string) => warnings.push(`${path}: ${warning}`)
    const found = node.custom ? customProblems(node, scope, input) : nodeProblems(node, scope, { ...input, params, warn })
    for (const problem of found) problems.push(`${path}: ${problem}`)
  })
  return { problems, warnings }
}

/** The problems of a page, as `pageFindings` gives them. */
export const pageProblems = (page: PageModel, input: PageCheckInput): string[] => pageFindings(page, input).problems

/**
 * Throws one error listing every problem of every page, including names that collide with each other or a resource,
 * and with `strict` every shadowed name too. Returns the warnings of shadowed names otherwise.
 */
export const checkPages = (pages: PageModel[], input: PageCheckInput): string[] => {
  const problems: string[] = []
  const warnings: string[] = []
  const seen = new Set<string>()
  const named = { ...input, pages: input.pages ?? new Set(pages.map((page) => page.name)) }
  for (const page of pages) {
    if (seen.has(page.name)) problems.push(`Page "${page.name}" is defined twice`)
    if (input.models[page.name]) problems.push(`Page "${page.name}" has the name of a resource; both would be at /${page.name}`)
    seen.add(page.name)
    const found = pageFindings(page, named)
    for (const problem of found.problems) problems.push(`Page "${page.name}": ${problem}`)
    for (const warning of found.warnings) (input.strict ? problems : warnings).push(`Page "${page.name}": ${warning}`)
  }
  if (problems.length > 0) throw new Error(`The pages do not match the resources:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
  return warnings
}
