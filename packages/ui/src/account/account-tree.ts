import { mapTree, type LayoutNode } from '@protobase/layout'

/**
 * The account page's tree without the account blocks named in `hidden`, those with nothing to show for this app, and
 * without the tabs that leaves empty, so a tab such as "Connected apps" is not offered on an app without MCP.
 */
export const shownAccountTree = (tree: LayoutNode, hidden: ReadonlySet<string>): LayoutNode => {
  const shown = mapTree(tree, (node) => {
    if (node.custom) return node
    if (hidden.has(node.type)) return null
    if ((node.type === 'Tab' || node.type === 'Tabs') && node.children.length === 0) return null
    return node
  })
  if (!shown) throw new Error('The account page keeps its Page, which no hidden block replaces')
  return shown
}
