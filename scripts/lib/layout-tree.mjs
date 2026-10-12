/**
 * The page's layout as text, one element a line, indented by depth: its tag, role and classes, and the computed CSS
 * that places it (display, and how a flex or grid container lays out its children, a position other than static, a
 * hidden visibility). No text, sizes or other attributes, so it reads the same on every machine and every day.
 * Runs in the page, through `page.evaluate`; Storybook's own elements are left out.
 */
export const layoutTree = () => {
  const skipped = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT'])
  const storybook = (element) => element.id === 'storybook-docs' || [...element.classList].some((name) => name.startsWith('sb-'))
  const layout = (element) => {
    const style = getComputedStyle(element)
    const parts = [style.display]
    if (/flex|grid/.test(style.display)) parts.push(...['flex-direction', 'flex-wrap', 'align-items', 'justify-content'].map((name) => style.getPropertyValue(name)))
    if (style.position !== 'static') parts.push(style.position)
    if (style.visibility !== 'visible') parts.push(style.visibility)
    return parts.join(' ')
  }
  const lines = []
  const visit = (element, depth) => {
    if (skipped.has(element.tagName) || storybook(element)) return
    const role = element.getAttribute('role')
    const classes = [...element.classList].join(' ')
    lines.push(`${'  '.repeat(depth)}${element.tagName.toLowerCase()}${role ? ` role=${role}` : ''}${classes ? ` .${classes}` : ''} | ${layout(element)}`)
    // An icon's paths say nothing about the page's layout
    if (element.tagName.toLowerCase() === 'svg') return
    for (const child of element.children) visit(child, depth + 1)
  }
  for (const child of document.body.children) visit(child, 0)
  return `${lines.join('\n')}\n`
}
