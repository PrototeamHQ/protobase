import { isLayoutNode, type LayoutChild, type LayoutNode, type LayoutValue } from '../node'
import { isInlineChild } from '../inline-fields'
import { fillProps } from '../scope-values'
import { childScope, pageScope, propScope } from '../walk'
import { textForms } from './forms'
import { escapeMarkdown } from './markdown'
import { childrenText, type TextForm, type TextOptions } from './text-form'

// A `Text`, a `Link` and a `Summary` are one line: everything they hold runs on.
const holdsOneLine = (node: LayoutNode) => !node.custom && (node.type === 'Text' || node.type === 'Link' || node.type === 'Summary')

const isElements = (value: LayoutValue): value is LayoutNode | LayoutNode[] => isLayoutNode(value) || (Array.isArray(value) && value.length > 0 && value.every(isLayoutNode))

// What sits inside a record card holds a record of its own, which the text does not have, so it reads no record
const scoped = (options: TextOptions, inRecord: boolean): TextOptions => (inRecord ? { ...options, record: undefined, fields: undefined } : options)

// A custom component reads as its fallback where it declares one, else as what it holds
const customForm: TextForm = (context) => childrenText(context.fallback ? { ...context, children: context.fallback } : context)

const formOf = (node: LayoutNode, options: TextOptions): TextForm => options.forms?.[node.type] ?? (node.custom ? customForm : textForms[node.type]) ?? childrenText

/** The text of each child, a run of inline children joined into one part. */
const partsOf = (children: LayoutChild[], options: TextOptions, oneLine: boolean): string[] => {
  const parts: string[] = []
  let runOn = false
  for (const child of children) {
    const text = typeof child === 'string' ? escapeMarkdown(child) : renderText(child, options)
    // Text, links, `Text as="span"` and field components run on in one line, as the web draws them; other elements stand alone
    const inline = oneLine || isInlineChild(child)
    if (inline && runOn) parts[parts.length - 1] += text
    else parts.push(text)
    runOn = inline
  }
  return parts
}

/**
 * The Markdown text of a layout tree, for clients that draw no blocks and for MCP clients and LLMs. One pass, children
 * first: each element's text form gets its children's text already rendered, so a container needs no form of its own.
 * `options.forms` adds or replaces forms by block type.
 */
export const renderText = (unfilled: LayoutNode, options: TextOptions = {}): string => {
  // Its `{{path}}`s read the record around the tree, the only one the text has; others read as empty
  const node = fillProps(unfilled, { stack: options.record ? [{ record: options.record }] : [] })
  const inner = scoped(options, childScope(node, pageScope).stack.length > 0)
  const slotOptions = scoped(options, propScope(node, pageScope).stack.length > 0)
  const slots = Object.fromEntries(
    Object.entries(node.props).flatMap(([name, value]) => (isElements(value) ? [[name, (Array.isArray(value) ? value : [value]).map((element) => renderText(element, slotOptions))]] : [])),
  )
  const fallback = node.fallback && partsOf(node.fallback, options, false)
  // A Switch's children are Matches, one part each, so its text form finds the one it draws by its place
  const own = !node.custom && node.type === 'Switch' ? node.children.filter((child) => typeof child !== 'string') : node.children
  const children = partsOf(own, inner, holdsOneLine(node))
  return formOf(node, options)({ node, children, slots, ...(fallback && { fallback }), options }).trim()
}
