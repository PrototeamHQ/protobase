import postcss, { type AtRule, type ChildNode, type Container } from 'postcss'

/**
 * The layer, nested in `utilities`, that holds a plugin's utilities without a variant. Rules outside a nested layer win
 * over the rules inside it, so the app's own utilities win over these, whatever the order of the stylesheets.
 */
export const pluginBaseLayer = 'plugin'

// A utility's class name without its arbitrary values, so `[mask-type:luminance]` reads as a utility without variants.
const withoutBrackets = (name: string) => {
  let depth = 0
  let out = ''
  for (const char of name) {
    if (char === '[') depth += 1
    else if (char === ']') depth -= 1
    else if (depth === 0) out += char
  }
  return out
}

/** Whether a utility's class name has a variant, such as `md:flex`, `hover:bg-muted` or `[&>*]:p-2`. */
export const hasVariant = (name: string) => withoutBrackets(name).includes(':')

const unescape = (name: string) => name.replace(/\\([0-9a-fA-F]{1,6}) ?|\\(.)/g, (_, hex: string | undefined, char: string | undefined) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : char!))

/** The class names in a selector, also those inside :is(), :where() and :not(), unescaped: `.md\:flex` is `md:flex`. */
export const classNames = (selector: string) => [...selector.matchAll(/\.((?:\\[0-9a-fA-F]{1,6} ?|\\.|[\w-]|[^\x00-\x7f])+)/g)].map(([, name]) => unescape(name!))

type Parts = { base: ChildNode[]; variant: ChildNode[] }

// A copy of a grouping rule around other children.
const around = (node: AtRule, children: ChildNode[]) => {
  const copy = node.clone()
  copy.removeAll()
  return copy.append(children.map((child) => child.clone()))
}

// The rules without a variant and the rules with one, a rule naming both split in two, and so each grouping rule (such
// as @media or @supports) around them.
const partition = (nodes: ChildNode[]): Parts => {
  const parts: Parts = { base: [], variant: [] }
  for (const node of nodes) {
    if (node.type === 'rule') {
      const varies = (selector: string) => classNames(selector).some(hasVariant)
      const base = node.selectors.filter((selector) => !varies(selector))
      const variant = node.selectors.filter(varies)
      if (base.length > 0) parts.base.push(variant.length === 0 ? node : node.clone({ selectors: base }))
      if (variant.length > 0) parts.variant.push(base.length === 0 ? node : node.clone({ selectors: variant }))
    } else if (node.type === 'atrule' && ['media', 'supports', 'container'].includes(node.name) && node.nodes) {
      const inner = partition(node.nodes)
      if (inner.base.length > 0) parts.base.push(around(node, inner.base))
      if (inner.variant.length > 0) parts.variant.push(around(node, inner.variant))
    } else {
      // Anything else stays where Tailwind put it, after the app's utilities
      parts.variant.push(node)
    }
  }
  return parts
}

const isUtilities = (node: ChildNode): node is AtRule & Container => node.type === 'atrule' && node.name === 'layer' && node.params.trim() === 'utilities' && node.nodes !== undefined

/**
 * A plugin's stylesheet with its utilities without a variant moved into a layer under the app's utilities. The app
 * loads a plugin's stylesheet after its own, where a plugin's `.flex` would otherwise win over the app's `md:block` on
 * the app's own elements. A plugin's variants stay after the app's utilities, so its `hidden md:flex` still works when
 * only the app's stylesheet has `.hidden`.
 */
export const layerPluginUtilities = (css: string) => {
  const root = postcss.parse(css)
  for (const node of root.nodes.filter(isUtilities)) {
    const { base, variant } = partition(node.nodes!)
    const kept = variant.map((child) => child.clone())
    node.removeAll()
    if (base.length > 0) node.append(postcss.atRule({ name: 'layer', params: pluginBaseLayer }).append(base.map((child) => child.clone())))
    node.append(kept)
  }
  return root.toString()
}
