import { isLayoutNode, type LayoutChild, type LayoutNode, type LayoutValue } from '../node'
import { fillProps } from '../scope-values'
import { childScope, pageScope, propScope } from '../walk'
import { textForms } from './forms'
import { itemRecord, listOf, referencedRecord } from './list-records'
import { blocks, escapeMarkdown } from './markdown'
import { childrenText, type TextForm, type TextOptions } from './text-form'

// Text, links and `Text as="span"` run on in one line, as the web draws them; other elements stand alone.
const isInline = (child: LayoutChild) => typeof child === 'string' || (!child.custom && (child.type === 'Link' || (child.type === 'Text' && child.props.as === 'span')))

// A `Text` and a `Link` are one line: everything they hold runs on.
const holdsOneLine = (node: LayoutNode) => !node.custom && (node.type === 'Text' || node.type === 'Link')

const isElements = (value: LayoutValue): value is LayoutNode | LayoutNode[] => isLayoutNode(value) || (Array.isArray(value) && value.length > 0 && value.every(isLayoutNode))

// What sits inside a record card holds a record of its own, which the text does not have, so it reads no record
const scoped = (options: TextOptions, inRecord: boolean): TextOptions => (inRecord ? { ...options, record: undefined, fields: undefined } : options)

// A custom component reads as its fallback where it declares one, else as what it holds
const customForm: TextForm = (context) => childrenText(context.fallback ? { ...context, children: context.fallback } : context)

const formOf = (node: LayoutNode, options: TextOptions): TextForm => options.forms?.[node.type] ?? (node.custom ? customForm : textForms[node.type]) ?? childrenText

/** The text of each child, a run of inline children joined into one part; `list` is the list around them, if any. */
const partsOf = (children: LayoutChild[], options: TextOptions, oneLine: boolean, list?: unknown[]): string[] => {
  const parts: string[] = []
  let runOn = false
  for (const child of children) {
    const text = typeof child === 'string' ? escapeMarkdown(child) : render(child, options, list)
    const inline = oneLine || isInline(child)
    if (inline && runOn) parts[parts.length - 1] += text
    else parts.push(text)
    runOn = inline
  }
  return parts
}

// A RecordsIterator reads as its children once per record of the list around it, each in that record; while the text
// does not have the list, once without a record, as a field reads as its label alone
const iterate = (node: LayoutNode, options: TextOptions, list: unknown[] | undefined) => {
  if (list === undefined) return blocks(partsOf(node.children, { ...options, record: undefined, fields: undefined }, false))
  return blocks(list.map((item) => blocks(partsOf(node.children, { ...options, record: itemRecord(item), fields: undefined }, false))))
}

// The record the children of a ReferenceField read, when the caller read it; none otherwise, as in a record card
const childOptions = (node: LayoutNode, options: TextOptions): TextOptions => {
  if (!node.custom && node.type === 'ReferenceField') {
    const record = referencedRecord(node, options)
    return { ...options, record, fields: undefined }
  }
  return scoped(options, childScope(node, pageScope).stack.length > 0)
}

const render = (unfilled: LayoutNode, options: TextOptions, around: unknown[] | undefined): string => {
  // Its `{{path}}`s read the record around the tree, the only one the text has; others read as empty
  const node = fillProps(unfilled, { stack: options.record ? [{ record: options.record }] : [] })
  if (!node.custom && node.type === 'RecordsIterator') return iterate(node, options, around).trim()
  // A list context puts its list around its children; other elements pass on the one around them
  const list = listOf(node, options) ?? (childScope(node, pageScope).stack.length > 0 ? undefined : around)
  const inner = childOptions(node, options)
  const slotOptions = scoped(options, propScope(node, pageScope).stack.length > 0)
  const slots = Object.fromEntries(
    Object.entries(node.props).flatMap(([name, value]) => (isElements(value) ? [[name, (Array.isArray(value) ? value : [value]).map((element) => renderText(element, slotOptions))]] : [])),
  )
  const fallback = node.fallback && partsOf(node.fallback, options, false)
  // A Switch's children are Matches, one part each, so its text form finds the one it draws by its place
  const own = !node.custom && node.type === 'Switch' ? node.children.filter((child) => typeof child !== 'string') : node.children
  const children = partsOf(own, inner, holdsOneLine(node), list)
  return formOf(node, options)({ node, children, slots, ...(fallback && { fallback }), options }).trim()
}

/**
 * The Markdown text of a layout tree, for clients that draw no blocks and for MCP clients and LLMs. One pass, children
 * first: each element's text form gets its children's text already rendered, so a container needs no form of its own.
 * `options.forms` adds or replaces forms by block type.
 */
export const renderText = (node: LayoutNode, options: TextOptions = {}): string => render(node, options, undefined)
