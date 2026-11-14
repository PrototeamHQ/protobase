import { defaultSource } from '../list-blocks'
import { referenceManyFilter, sortText } from '../list-query'
import { childrenText, type TextContext, type TextForm } from './text-form'
import { blocks, escapeMarkdown, link, valueText } from './markdown'
import { addressHref, recordValue } from './record-value'
import { listOf } from './list-records'

// Text forms of the blocks that hold a list or a record they read from the record around them: what they hold once
// the caller read it, and a link to where the records are while it did not.

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

const sourceValue = ({ node, options }: TextContext) => (options.record ? recordValue(options.record, text(node.props.source) ?? defaultSource) : undefined)

// The list's records as the API lists them, filtered as the block reads them where the record around it is known
const listLink = (context: TextContext, filter: string | undefined) => {
  const reference = String(context.node.props.reference)
  return link(escapeMarkdown(reference), addressHref({ kind: 'list', resource: reference, ...(filter && { filter }), ...(sortText(context.node.props.sort) && { orderBy: sortText(context.node.props.sort) }) }, context.options))
}

// What a list holds, `empty` when it holds nothing, and a link to its records while the text does not have them
const listBlock = (context: TextContext, filter: () => string | undefined) => {
  const list = listOf(context.node, context.options)
  if (list === undefined) return listLink(context, context.options.record ? filter() : undefined)
  if (list.length === 0) return escapeMarkdown(text(context.node.props.empty) ?? '')
  return childrenText(context)
}

const ReferenceManyField: TextForm = (context) => listBlock(context, () => referenceManyFilter(String(context.node.props.target), sourceValue(context), context.node.props.filter))

// Its link names no keys: the text does not know the key field of the records it points at
const ReferenceArrayField: TextForm = (context) => listBlock(context, () => undefined)

// Its children read in the record the caller read for it; without children, the text has only the record's key. A
// link around it holds one line only
const ReferenceField: TextForm = (context) => {
  const { node, options, children } = context
  const key = sourceValue(context)
  if (key === undefined || key === null || key === '') return escapeMarkdown(text(node.props.emptyText) ?? '')
  const shown = node.children.length > 0 ? blocks(children) : escapeMarkdown(valueText(key))
  if (node.props.link === false || shown.includes('\n')) return shown
  return link(shown, addressHref({ kind: 'record', resource: String(node.props.reference), key: String(key) }, options))
}

export const listForms: Record<string, TextForm> = { ReferenceManyField, ReferenceArrayField, ReferenceField }
