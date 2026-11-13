import { blocks, escapeMarkdown, heading } from './markdown'
import type { TextContext } from './text-form'

/** A block's heading of `level` over its description, its `actions` and `body`, each a part of its own. */
export const headed = ({ node, slots }: TextContext, level: number, title: string, body: string[] = []) => {
  const description = typeof node.props.description === 'string' ? escapeMarkdown(node.props.description) : ''
  return blocks([heading(level, title), description, ...(slots.actions ?? []), ...body])
}

/** The block's `title` prop as Markdown, or none. */
export const titleOf = ({ node }: TextContext) => (typeof node.props.title === 'string' ? escapeMarkdown(node.props.title) : '')
