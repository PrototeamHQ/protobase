// What a screen reader would trip over in a page's accessibility tree, as Chromium's `Accessibility.getFullAXTree`
// gives it: a flat list of nodes, each with its `childIds`, of which those `ignored` are not exposed.

// The nodes a screen reader reads, in reading order: from the root down, each before its children.
const readOrder = (nodes) => {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]))
  const root = nodes.find((node) => node.parentId === undefined)
  if (!root) throw new Error('The accessibility tree has no root')
  const ordered = []
  const visit = (node) => {
    if (!node.ignored) ordered.push(node)
    for (const id of node.childIds ?? []) {
      const child = byId.get(id)
      if (child) visit(child)
    }
  }
  visit(root)
  return ordered
}

const role = (node) => node.role?.value
const name = (node) => String(node.name?.value ?? '').trim()
const level = (node) => node.properties?.find((property) => property.name === 'level')?.value.value

/**
 * The problems a page's tree has, as lines to print: a link or button with no name, not exactly one main landmark, and a
 * heading more than one level below the one before it.
 */
export const axProblems = (nodes) => {
  const read = readOrder(nodes)
  const problems = read.filter((node) => (role(node) === 'link' || role(node) === 'button') && name(node) === '').map((node) => `a ${role(node)} without a name (DOM node ${node.backendDOMNodeId})`)
  const mains = read.filter((node) => role(node) === 'main').length
  if (mains !== 1) problems.push(`${mains} main landmarks, not 1`)
  let previous
  for (const heading of read.filter((node) => role(node) === 'heading')) {
    const at = level(heading)
    if (previous !== undefined && at > previous + 1) problems.push(`heading "${name(heading)}" at level ${at} follows level ${previous}`)
    previous = at
  }
  return problems
}

/**
 * The text that does not grow with the root text size: `before` and `after` are each element's font size in pixels, by
 * a key and with its text, at a root size and at `factor` times it. A size within half a pixel of `factor` times its old
 * one grew.
 */
export const fixedText = (before, after, factor) =>
  before.flatMap(({ key, text, size }) => {
    const grown = after.find((entry) => entry.key === key)
    if (!grown) return []
    return Math.abs(grown.size - size * factor) <= 0.5 ? [] : [`"${text}" stays at ${grown.size}px, not ${size * factor}px`]
  })

// Whether an outline draws: `auto` draws the system's ring whatever its width, any other style but `none` only with a width
// above zero.
export const outlineShows = (style, width) => style === 'auto' || (style !== 'none' && width > 0)

/**
 * The links and buttons with no focus ring in forced colors, where the system draws only outlines and drops shadow
 * rings: `focused` is each one's text and its outline style and width in pixels while focused, with forced colors on.
 */
export const hiddenFocus = (focused) =>
  focused.filter(({ outline, outlineWidth }) => !outlineShows(outline, outlineWidth)).map(({ text, outline, outlineWidth }) => `"${text}" shows no outline when focused in forced colors (${outline} ${outlineWidth}px)`)

/**
 * The page's scrolling width and the top bar's links and buttons that run past the page's `width`: `page` is the page's
 * scroll width and `bar` each shown control's text and right edge, in pixels.
 */
export const offScreen = ({ width, page, bar }) => [
  ...(page > width ? [`the page is ${page}px wide, wider than ${width}px`] : []),
  ...bar.filter(({ right }) => right > width).map(({ text, right }) => `the top bar's "${text}" ends at ${right}px, past ${width}px`),
]

// How far a computed `box-shadow`, such as a focus ring's, reaches past its box: the largest spread, the fourth length,
// of its shadows, in pixels.
export const ringWidth = (boxShadow) => Math.max(0, ...boxShadow.split(/,(?![^(]*\))/).map((shadow) => Number.parseFloat(shadow.match(/-?[\d.]+px/g)?.[3] ?? '0')))

/**
 * The field and buttons over the top bar that run past its top or bottom, a focus ring included: `bar` is the bar's top
 * and bottom, and `controls` each one's text, top and bottom in pixels and computed `box-shadow`.
 */
export const outsideBar = ({ bar, controls }) =>
  controls.flatMap(({ text, top, bottom, boxShadow }) => {
    const ring = ringWidth(boxShadow)
    if (top - ring >= bar.top && bottom + ring <= bar.bottom) return []
    return [`the top bar's "${text}" runs from ${top - ring}px to ${bottom + ring}px, outside the bar's ${bar.top}px to ${bar.bottom}px`]
  })
