import { headed, titleOf } from './headed'
import { escapeMarkdown, link } from './markdown'
import { addressHref } from './record-value'
import type { TextContext, TextForm } from './text-form'

// Text forms of the blocks that show records: their heading links to where the records are, and what they hold follows.

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

// The block's title, or its resource's name, linked to its records' list as the block filters and orders it
const listHeading = (context: TextContext) => {
  const { resource, filter, sort, display } = context.node.props
  const href = addressHref({ kind: 'list', resource: String(resource), filter: text(filter), orderBy: text(sort), display: text(display) }, context.options)
  return link(titleOf(context) || escapeMarkdown(String(resource)), href)
}

const listBlock: TextForm = (context) => headed(context, 3, listHeading(context), context.children)

// A record card with a key links to that record, and otherwise to the list its filter finds it in
const RecordCard: TextForm = (context) => {
  const { resource, recordKey } = context.node.props
  if (typeof recordKey !== 'string') return listBlock(context)
  const title = titleOf(context) || escapeMarkdown(String(resource))
  return headed(context, 3, link(title, addressHref({ kind: 'record', resource: String(resource), key: recordKey }, context.options)), context.children)
}

const Settings: TextForm = (context) => headed(context, 3, titleOf(context))

export const dataForms: Record<string, TextForm> = {
  RecordCard,
  CardRow: listBlock,
  Table: listBlock,
  RecordRow: listBlock,
  RecordCards: listBlock,
  Chart: listBlock,
  Thread: listBlock,
  Settings,
}
