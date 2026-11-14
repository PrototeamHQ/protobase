import type { LayoutNode } from './node'
import { paramNamePattern, type Choice } from './page-params'
import { selectBlocks } from './select-blocks'
import { walkTree } from './walk'

// Where a page's parameters are declared, checked without the models: each name once, as a plain name, and a
// `SelectInput`'s choices and default one value each.

const nameProblem = (prop: string, name: string) => (paramNamePattern.test(name) ? [] : [`"${prop}" names a page parameter, such as window, and "${name}" is none`])

const inputProblems = ({ props }: LayoutNode): string[] => {
  const problems = nameProblem('source', String(props.source))
  const choices = props.choices as Choice[] | undefined
  if (!choices) return props.defaultValue === undefined ? problems : [...problems, '"defaultValue" is one of the choices; give it "choices"']
  const ids = choices.map((choice) => String(choice.id))
  const twice = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
  problems.push(...twice.map((id) => `"choices" holds the id "${id}" twice`))
  if (choices.length === 0) problems.push('"choices" holds no choice')
  if (props.defaultValue !== undefined && !ids.includes(String(props.defaultValue))) problems.push(`"defaultValue" "${props.defaultValue}" is none of the choices' ids: ${ids.join(', ')}`)
  return problems
}

const selectProblems = ({ props, children }: LayoutNode): string[] => {
  if (typeof props.select === 'string') return [...nameProblem('select', props.select), ...(props.resource === undefined ? ['"select" needs "resource", the records it chooses from'] : [])]
  return children.length > 0 ? ['takes children only with "select": they draw the row it chooses'] : []
}

/** Problems of a page's parameters: names a page sets twice or that are no names, choices, defaults and `select`s. */
export const pageParamProblems = (tree: LayoutNode): string[] => {
  const problems: string[] = []
  const seen = new Set<string>()
  walkTree(tree, (node, { path }) => {
    if (node.custom) return
    const report = (problem: string) => problems.push(`${path}: ${problem}`)
    const declared = node.type === 'SelectInput' ? node.props.source : selectBlocks.has(node.type) ? node.props.select : undefined
    if (node.type === 'SelectInput') inputProblems(node).forEach(report)
    if (selectBlocks.has(node.type)) selectProblems(node).forEach(report)
    if (typeof declared !== 'string') return
    if (seen.has(declared)) report(`the page parameter "${declared}" is set twice on the page; give each SelectInput and select a name of its own`)
    seen.add(declared)
  })
  return problems
}
