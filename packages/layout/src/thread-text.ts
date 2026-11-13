import type { LayoutNode, LayoutValue } from './node'
import { blocks } from './text/markdown'
import { renderText } from './text/render-text'
import { threadRule } from './text/thread-forms'

/**
 * One item of a thread as its text forms read it, oldest first: a message by its sender, or a tool call by its name.
 * `status` is the label the client shows, such as an enum value's; a call whose status is unknown has none. A
 * message's text with `markdown` is Markdown already and reads as written; other text is escaped.
 */
export type ThreadTextItem =
  | { kind: 'message'; sender: string; time?: string; text: string; status?: string; markdown?: boolean }
  | { kind: 'call'; name: string; time?: string; status?: string; input?: unknown; result?: unknown; error?: string }

/** The words over a tool call's parts in its Markdown, in the reader's language. */
export type ToolCallWords = { input: string; result: string; error: string }

const withStatus = (head: string, status: string | undefined) => (status === undefined ? head : `${head} · ${status}`)

const firstLine = (text: string) => text.split('\n', 1)[0]!.trim()

/**
 * A thread's simpler form, for a client that cannot draw it, such as a watch: one short line per item, a message as its
 * sender and its first line, a tool call as its name and status.
 */
export const threadLines = (items: ThreadTextItem[]): string[] => items.map((item) => (item.kind === 'call' ? withStatus(item.name, item.status) : `${item.sender}: ${firstLine(item.text)}`))

const message = (item: Extract<ThreadTextItem, { kind: 'message' }>): LayoutNode => ({
  type: 'ThreadMessage',
  props: { sender: item.sender, text: item.text, ...(item.time !== undefined && { time: item.time }), ...(item.status !== undefined && { status: item.status }), ...(item.markdown && { markdown: true }) },
  children: [],
})

const call = (item: Extract<ThreadTextItem, { kind: 'call' }>, words: ToolCallWords): LayoutNode => ({
  type: 'ToolCall',
  props: {
    name: item.name,
    labels: words,
    ...(item.time !== undefined && { time: item.time }),
    ...(item.status !== undefined && { status: item.status }),
    ...(item.input != null && { input: item.input as LayoutValue }),
    ...(item.result != null && { result: item.result as LayoutValue }),
    ...(item.error != null && { error: item.error }),
  },
  children: [],
})

/**
 * A thread's items as elements whose text forms render them, to put in its `Thread` element's children so
 * `renderText` reads the page with its thread.
 */
export const threadItemNodes = (items: ThreadTextItem[], words: ToolCallWords): LayoutNode[] => items.map((item) => (item.kind === 'call' ? call(item, words) : message(item)))

/**
 * A thread as Markdown, its last-resort text form for clients that read text, such as an MCP client or a language
 * model: each item rendered by `renderText`, a message under its sender in bold, a tool call as its name and status
 * with its input and result as JSON and its error in fenced code blocks, items apart by a rule.
 */
export const threadMarkdown = (items: ThreadTextItem[], words: ToolCallWords): string => blocks(threadItemNodes(items, words).map((node) => renderText(node)), threadRule)
