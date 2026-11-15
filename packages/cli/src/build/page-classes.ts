import { walkTree, type LayoutNode, type PageModel } from '@protobase/layout'
import type { ViewModel } from '@protobase/schema'
import { layoutItems } from '@protobase/schema/internal'

const treeCarriesClasses = (tree: LayoutNode) => {
  let found = false
  walkTree(tree, (node) => {
    if (typeof node.props.className === 'string' && node.props.className.trim() !== '') found = true
  })
  return found
}

/** Whether any element of the pages carries Tailwind classes, which then need a stylesheet of the project's. */
export const pagesCarryClasses = (pages: PageModel[]) => pages.some((page) => treeCarriesClasses(page.tree))

/** Whether any element of the views' record page block trees (`l.blocks`), in tabs and fallbacks too, carries Tailwind classes. */
export const viewsCarryClasses = (views: ViewModel[]) =>
  views.some((view) => layoutItems(view.layout).some((item) => item.kind === 'blocks' && treeCarriesClasses(item.tree as LayoutNode)))
