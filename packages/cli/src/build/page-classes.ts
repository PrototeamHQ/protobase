import { walkTree, type PageModel } from '@protobase/layout'

/** Whether any element of the pages carries Tailwind classes, which then need a stylesheet of the project's. */
export const pagesCarryClasses = (pages: PageModel[]) =>
  pages.some((page) => {
    let found = false
    walkTree(page.tree, (node) => {
      if (typeof node.props.className === 'string' && node.props.className.trim() !== '') found = true
    })
    return found
  })
