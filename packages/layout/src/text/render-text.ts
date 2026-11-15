import { pointerOf } from '../element-at'
import { isLayoutNode, type LayoutChild, type LayoutNode, type LayoutValue } from '../node'
import { isInlineChild } from '../inline-fields'
import { pageParamValues } from '../page-params'
import { fillProps } from '../scope-values'
import { selectBlocks } from '../select-blocks'
import { childScope, pageScope, propScope } from '../walk'
import { textForms } from './forms'
import { itemRecord, listOf, referencedRecord } from './list-records'
import { blocks, escapeMarkdown } from './markdown'
import { childrenText, type TextForm, type TextOptions } from './text-form'

// A `Text`, a `Link` and a `Summary` are one line: everything they hold runs on.
const holdsOneLine = (node: LayoutNode) => !node.custom && (node.type === 'Text' || node.type === 'Link' || node.type === 'Summary')

const isElements = (value: LayoutValue): value is LayoutNode | LayoutNode[] => isLayoutNode(value) || (Array.isArray(value) && value.length > 0 && value.every(isLayoutNode))

// What sits inside a record card holds a record of its own, which the text does not have, so it reads no record
const scoped = (options: TextOptions, inRecord: boolean): TextOptions => (inRecord ? { ...options, record: undefined, fields: undefined } : options)

// A custom component reads as its fallback where it declares one, else as what it holds
const customForm: TextForm = (context) => childrenText(context.fallback ? { ...context, children: context.fallback } : context)

const formOf = (node: LayoutNode, options: TextOptions): TextForm => options.forms?.[node.type] ?? (node.custom ? customForm : textForms[node.type]) ?? childrenText

/** A child and its place in the tree. */
type Placed = { child: LayoutChild; at: string }

const placed = (children: LayoutChild[], at: string, place: string): Placed[] => children.map((child, index) => ({ child, at: pointerOf(at, place, index) }))

/** The text of each child, a run of inline children joined into one part; `list` is the list around them, if any. */
const partsOf = (children: Placed[], options: TextOptions, oneLine: boolean, list?: unknown[]): string[] => {
  const parts: string[] = []
  let runOn = false
  for (const { child, at } of children) {
    const text = typeof child === 'string' ? escapeMarkdown(child) : render(child, options, list, at)
    // Text, links, `Text as="span"` and field components run on in one line, as the web draws them; other elements stand alone
    const inline = oneLine || isInlineChild(child)
    if (inline && runOn) parts[parts.length - 1] += text
    else parts.push(text)
    runOn = inline
  }
  return parts
}

// A RecordsIterator reads as its children once per record of the list around it, each in that record; while the text
// does not have the list, once without a record, as a field reads as its label alone
const iterate = (children: Placed[], options: TextOptions, list: unknown[] | undefined) => {
  if (list === undefined) return blocks(partsOf(children, { ...options, record: undefined, fields: undefined }, false))
  return blocks(list.map((item) => blocks(partsOf(children, { ...options, record: itemRecord(item), fields: undefined }, false))))
}

// A CardRow's records, when the caller read them: its children read once per record, a part each
const cardsOf = (node: LayoutNode, options: TextOptions, at: string) => (!node.custom && node.type === 'CardRow' ? options.records?.(node, options.record, at) : undefined)

// The record the children of a ReferenceField, a RecordCard or a block's `select` read, when the caller read it; none otherwise
const childOptions = (node: LayoutNode, options: TextOptions, at: string): TextOptions => {
  if (!node.custom && (node.type === 'ReferenceField' || node.type === 'RecordCard' || (selectBlocks.has(node.type) && typeof node.props.select === 'string'))) {
    const record = referencedRecord(node, options, at)
    return { ...options, record, fields: undefined }
  }
  return scoped(options, childScope(node, pageScope).stack.length > 0)
}

const render = (unfilled: LayoutNode, options: TextOptions, around: unknown[] | undefined, at: string): string => {
  // Its `{{path}}`s read the record around the tree, the only one the text has, and the page's parameters; others read as empty
  const node = fillProps(unfilled, { stack: options.record ? [{ record: options.record }] : [], ...(options.params && { params: options.params }) })
  if (!node.custom && node.type === 'RecordsIterator') return iterate(placed(node.children, at, 'children'), options, around).trim()
  // A list context puts its list around its children; other elements pass on the one around them
  const list = listOf(node, options, at) ?? (childScope(node, pageScope).stack.length > 0 ? undefined : around)
  const inner = childOptions(node, options, at)
  // A RecordCard's header actions sit in its record, as its children do
  const slotOptions = !node.custom && node.type === 'RecordCard' ? inner : scoped(options, propScope(node, pageScope).stack.length > 0)
  const slots = Object.fromEntries(
    Object.entries(node.props).flatMap(([name, value]) => (isElements(value) ? [[name, (Array.isArray(value) ? value : [value]).map((element, index) => render(element, slotOptions, undefined, pointerOf(at, 'props', name, ...(Array.isArray(value) ? [index] : []))))]] : [])),
  )
  // A custom component's fallback draws in its place, so it reads the list around it as its children do
  const fallback = node.fallback && partsOf(placed(node.fallback, at, 'fallback'), options, false, list)
  // A Switch's children are Matches, one part each, so its text form finds the one it draws by its place
  const all = placed(node.children, at, 'children')
  const own = !node.custom && node.type === 'Switch' ? all.filter(({ child }) => typeof child !== 'string') : all
  // A block's `select` children draw nothing while no row is chosen, or the text does not have it
  const drawn = selectBlocks.has(node.type) && typeof node.props.select === 'string' && !inner.record ? [] : own
  const cards = cardsOf(node, options, at)
  const children = cards ? cards.map((card) => iterate(drawn, options, [card])) : partsOf(drawn, inner, holdsOneLine(node), list)
  return formOf(node, options)({ node, at, children, slots, ...(fallback && { fallback }), ...(around && { around }), options }).trim()
}

/**
 * The Markdown text of a layout tree, for clients that draw no blocks and for MCP clients and LLMs. One pass, children
 * first: each element's text form gets its children's text already rendered, so a container needs no form of its own.
 * `options.forms` adds or replaces forms by block type; `options.params` are the parameters the page's address gives,
 * which its `SelectInput`s hold to their choices.
 */
export const renderText = (node: LayoutNode, options: TextOptions = {}): string => render(node, { ...options, params: pageParamValues(node, options.params) }, undefined, '')
