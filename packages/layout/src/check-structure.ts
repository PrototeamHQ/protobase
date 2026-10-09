import { blockSpecs, propProblems } from './block-specs'
import { parseCondition } from './condition'
import type { LayoutNode } from './node'
import { walkTree, type Scope } from './walk'

/** Problems that need a record around the element, which only a `RecordCard` or a `CardRow` card provides. */
const recordProblems = (node: LayoutNode, scope: Scope): string[] => {
  if (scope.record) return []
  const { props } = node
  const outside = 'needs a record: put it inside a RecordCard or a CardRow'
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

/**
 * Checks a page's tree without the models: the root is one `Page`, every built-in element has known props of the right
 * kind, elements that show a record's fields sit inside one, and conditions parse. Returns the problems, each with
 * where it is.
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
    if (node.type === 'Show' && typeof node.props.when === 'string') {
      const parsed = parseCondition(node.props.when)
      if (!parsed.ok) report(`"when" is not a valid condition: ${parsed.message}`)
    }
  })
  return problems
}
