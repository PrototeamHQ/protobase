import { appHrefError, parseTemplatePath, templatePlaceholders } from '@protobase/schema/internal'
import { blockSpecs, propProblems } from './block-specs'
import { parseCondition } from './condition'
import { sampleSlots } from './filter-slots'
import type { LayoutChild, LayoutNode } from './node'
import { tabsProblems } from './check-tabs'
import { detailsProblems } from './check-details'
import { inlineFieldProblems } from './check-inline-fields'
import { inlineFieldTypes, isInlineChild } from './inline-fields'
import { innermost, label, pageScope, walkTree, type Scope } from './walk'

/** Problems that need a record around the element, which only a `RecordCard` or a `CardRow` card provides. */
const recordProblems = (node: LayoutNode, scope: Scope): string[] => {
  if (innermost(scope)) return []
  const { props } = node
  const outside = 'needs a record: put it inside a RecordCard or a CardRow'
  if (inlineFieldTypes.has(node.type)) return [outside]
  switch (node.type) {
    case 'Field':
      return [outside]
    case 'Stat':
      return props.field !== undefined ? [`with "field" ${outside}`] : []
    case 'Progress':
      return typeof props.value === 'string' || typeof props.max === 'string' ? [`with a field name ${outside}`] : []
    case 'ModalForm':
      return props.mode === 'edit' && (props.resource === undefined || props.recordKey === undefined) ? [`in edit mode ${outside}, or name "resource" and "recordKey"`] : []
    case 'Action':
      return props.resource === undefined ? [`${outside}, or name "resource"`] : []
    default:
      return []
  }
}

const statProblems = ({ props }: LayoutNode): string[] => {
  const sources = (['value', 'resource', 'field'] as const).filter((name) => props[name] !== undefined)
  if (sources.length !== 1) return ['takes exactly one of "value", "resource" (a count) and "field"']
  return props.filter !== undefined && props.resource === undefined ? ['"filter" needs "resource"'] : []
}

const chartStructureProblems = ({ props }: LayoutNode): string[] => (props.sum !== undefined && props.average !== undefined ? ['takes "sum" or "average", not both'] : [])

// A link inside a link is no valid HTML: browsers split them apart.
const nestedLinkProblems = ({ children }: LayoutNode): string[] => {
  const problems: string[] = []
  for (const child of children) {
    if (typeof child === 'string') continue
    walkTree(child, (inner, { path }) => {
      if (!inner.custom && (inner.type === 'Link' || inner.type === 'UrlField')) problems.push(`holds another link at ${path}; a link cannot contain a link`)
    }, { path: label(child), scope: pageScope })
  }
  return problems
}

// A link goes `to` an address in the app, or to an `href` that leaves it.
const linkProblems = (node: LayoutNode): string[] => {
  const { props } = node
  if ((props.to === undefined) === (props.href === undefined)) return ['takes exactly one of "to" (an address in the app) and "href" (a link that leaves it)']
  const error = typeof props.href === 'string' ? appHrefError(props.href) : undefined
  return [...(error ? [error] : []), ...nestedLinkProblems(node)]
}

// A picture comes from an API function or a fixed `src`: an `https:` URL or a path on the app's own origin.
const imageProblems = ({ props }: LayoutNode): string[] => {
  if ((props.function === undefined) === (props.src === undefined)) return ['takes exactly one of "function" (an API function draws it) and "src" (a fixed picture)']
  if (typeof props.src !== 'string') return []
  const ownPath = props.src.startsWith('/') && !props.src.startsWith('//')
  return [
    ...(ownPath || props.src.startsWith('https://') ? [] : ['"src" must be an https: URL or a path on the app\'s own origin, such as /logo.svg']),
    ...(props.alt === undefined ? ['"alt" is required with "src": describe what it shows, or write alt="" when it only decorates'] : []),
    ...(props.refresh === undefined ? [] : ['"refresh" is for a function\'s picture; a fixed "src" does not change']),
  ]
}

// A `Text` is one line of text: what sits in it runs inline.
const textProblems = ({ children }: LayoutNode): string[] =>
  children.every(isInlineChild) ? [] : ['holds text, <Link>s, <Text as="span">s and field components such as <TextField> only; put other elements beside it in a <Row> or <Column>']

const stringsIn = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (typeof value === 'object' && value !== null && !('children' in value && 'type' in value)) return Object.values(value).flatMap(stringsIn)
  return []
}

// Every `{{…}}` in a prop holds a Handlebars path and nothing else: no helpers, literals or triple braces.
const placeholderProblems = ({ props }: LayoutNode): string[] =>
  Object.entries(props).flatMap(([name, value]) =>
    stringsIn(value).flatMap((text) => [
      ...(text.includes('{{{') ? [`"${name}": {{{…}}} is not taken; write {{path}}`] : []),
      ...templatePlaceholders(text).filter((path) => !parseTemplatePath(path)).map((path) => `"${name}": "{{${path}}}" holds no path; write a field's name, ../name, this.name, @root.name, @params.name, @index, @first or @last`),
    ]),
  )

const isMatch = (child: LayoutChild) => typeof child !== 'string' && !child.custom && child.type === 'Match'

// A `Switch` holds `Match`es only, as SolidJS's does, and a `Match` sits in a `Switch` only.
const switchProblems = ({ type, children }: LayoutNode): string[] => {
  if (type === 'Switch') return children.every((child) => isMatch(child) || (typeof child === 'string' && child.trim() === '')) ? [] : ['holds <Match>es only']
  return children.some(isMatch) ? ['holds a <Match>, which only a <Switch> takes'] : []
}

/**
 * Checks a page's tree without the models: the root is one `Page`, every built-in element has known props of the right
 * kind, elements that show a record's fields sit inside one, tabs are placed as their address needs, and conditions
 * parse. Returns the problems, each with where it is.
 */
export const structureProblems = (tree: LayoutNode): string[] => {
  const problems: string[] = []
  if (tree.custom || tree.type !== 'Page') problems.push(`the root element is <${tree.type}>, it must be <Page>`)
  walkTree(tree, (node, { path, scope }) => {
    const report = (problem: string) => problems.push(`${path}: ${problem}`)
    if (node.custom) return
    const spec = blockSpecs[node.type]
    if (!spec) return report(`<${node.type}> is not a block; custom components are declared with component('${node.type}')`)
    if (node.type === 'Page' && node !== tree) report('<Page> is only allowed as the root')
    propProblems(spec, node.props, node.children.length).forEach(report)
    recordProblems(node, scope).forEach(report)
    if (node.type === 'Stat') statProblems(node).forEach(report)
    if (node.type === 'Chart') chartStructureProblems(node).forEach(report)
    if (node.type === 'Link') linkProblems(node).forEach(report)
    if (node.type === 'Image') imageProblems(node).forEach(report)
    if (node.type === 'Text') textProblems(node).forEach(report)
    detailsProblems(node).forEach(report)
    inlineFieldProblems(node).forEach(report)
    switchProblems(node).forEach(report)
    placeholderProblems(node).forEach(report)
    if ((node.type === 'Show' || node.type === 'Match') && typeof node.props.when === 'string') {
      // Its `{{path}}` slots stand in for values, which the page fills before it evaluates the condition
      const parsed = parseCondition(sampleSlots(node.props.when).text)
      if (!parsed.ok) report(`"when" is not a valid condition: ${parsed.message}`)
    }
  })
  return [...problems, ...tabsProblems(tree)]
}
