import { blocks, code, escapeMarkdown, fenced, strong } from './markdown'
import type { TextForm } from './text-form'

// Text forms of the items of a thread: a message and a tool call. A thread's text holds them apart by a rule.

/** What goes between the items of a thread in its text. */
export const threadRule = '\n\n---\n\n'

const textProp = (value: unknown) => (typeof value === 'string' ? value : undefined)

// The item's head, its time in brackets and its status after a dot
const head = (title: string, props: Record<string, unknown>) => {
  const time = textProp(props.time)
  const status = textProp(props.status)
  const timed = time === undefined ? title : `${title} (${escapeMarkdown(time)})`
  return status === undefined ? timed : `${timed} · ${escapeMarkdown(status)}`
}

const part = (label: string, body: string) => `${escapeMarkdown(label)}:\n\n${body}`

/** A message under its sender in bold; its text as written when it is Markdown, else escaped so it reads the same. */
const ThreadMessage: TextForm = ({ node }) => {
  const { sender, text, markdown } = node.props
  const body = String(text)
  return blocks([head(strong(escapeMarkdown(String(sender))), node.props), markdown === true ? body : escapeMarkdown(body)])
}

/** A tool call as its name and status, with its input and result, JSON text, and its error in fenced code blocks. */
const ToolCall: TextForm = ({ node }) => {
  const { name, input, result, error, labels } = node.props
  const words = labels as Record<'input' | 'result' | 'error', string>
  return blocks([
    head(code(String(name)), node.props),
    typeof input === 'string' ? part(words.input, fenced(input, 'json')) : '',
    typeof result === 'string' ? part(words.result, fenced(result, 'json')) : '',
    typeof error === 'string' && error !== '' ? part(words.error, fenced(error)) : '',
  ])
}

export const threadForms: Record<string, TextForm> = { ThreadMessage, ToolCall }
