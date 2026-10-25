import type { LayoutNode } from './node'
import { walkTree } from './walk'

// A tab's name is a segment of its address, after the page's, so it is written like a page name.
const tabName = /^[a-z][a-zA-Z0-9-]*$/

const isBuiltIn = (child: LayoutNode | string, type: string): child is LayoutNode => typeof child !== 'string' && !child.custom && child.type === type

// Problems inside one `Tabs`: what it holds, and the names of its tabs.
const ownProblems = (tabs: LayoutNode): string[] => {
  const problems: string[] = []
  if (tabs.children.some((child) => !isBuiltIn(child, 'Tab'))) problems.push('holds only <Tab> elements')
  const names = tabs.children.filter((child) => isBuiltIn(child, 'Tab')).map((tab) => tab.props.name)
  if (names.length === 0) problems.push('holds no <Tab>')
  for (const name of names.filter((name) => typeof name === 'string' && !tabName.test(name))) problems.push(`tab name "${String(name)}" must start with a lowercase letter and hold only letters, digits and dashes`)
  for (const name of new Set(names.filter((name, index) => names.indexOf(name) !== index))) problems.push(`two tabs are named "${String(name)}"`)
  return problems
}

/**
 * Problems with a page's tabs: the tabs take the page's address, so a page holds at most one `Tabs`, directly in its
 * `Page`, each `Tab` sits directly in it, and every tab has a name of its own that fits in an address.
 */
export const tabsProblems = (tree: LayoutNode): string[] => {
  const problems: string[] = []
  const placed = new Set<LayoutNode>()
  let count = 0
  walkTree(tree, (node, { path }) => {
    if (node.custom) return
    if (node.type === 'Tabs') {
      count += 1
      if (!tree.children.includes(node)) problems.push(`${path}: <Tabs> only sits directly in the <Page>`)
      if (count === 2) problems.push(`${path}: a page holds one <Tabs>, as its tabs take the page's address`)
      for (const child of node.children) if (isBuiltIn(child, 'Tab')) placed.add(child)
      ownProblems(node).forEach((problem) => problems.push(`${path}: ${problem}`))
    }
    if (node.type === 'Tab' && !placed.has(node)) problems.push(`${path}: <Tab> only sits directly in a <Tabs>`)
  })
  return problems
}
