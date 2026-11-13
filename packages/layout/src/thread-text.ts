/**
 * One item of a thread as its text forms read it, oldest first: a message by its sender, or a tool call by its name.
 * `status` is the label the client shows, such as an enum value's; a call whose status is unknown has none.
 */
export type ThreadTextItem =
  | { kind: 'message'; sender: string; time?: string; text: string; status?: string }
  | { kind: 'call'; name: string; time?: string; status?: string; input?: unknown; result?: unknown; error?: string }

/** The words over a tool call's parts in its Markdown, in the reader's language. */
export type ToolCallWords = { input: string; result: string; error: string }

const withStatus = (head: string, status: string | undefined) => (status === undefined ? head : `${head} · ${status}`)

const withTime = (head: string, time: string | undefined) => (time === undefined ? head : `${head} (${time})`)

const firstLine = (text: string) => text.split('\n', 1)[0]!.trim()

/**
 * A thread's simpler form, for a client that cannot draw it, such as a watch: one short line per item, a message as its
 * sender and its first line, a tool call as its name and status.
 */
export const threadLines = (items: ThreadTextItem[]): string[] => items.map((item) => (item.kind === 'call' ? withStatus(item.name, item.status) : `${item.sender}: ${firstLine(item.text)}`))

// Backticks longer than any run of them in the text, so the text cannot close its code
const ticksAround = (text: string, least: number) => '`'.repeat(Math.max(least, Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1))

const fenced = (text: string, language = '') => {
  const fence = ticksAround(text, 3)
  return `${fence}${language}\n${text}\n${fence}`
}

const code = (text: string) => {
  const ticks = ticksAround(text, 1)
  return ticks.length > 1 ? `${ticks} ${text} ${ticks}` : `${ticks}${text}${ticks}`
}

const json = (value: unknown) => fenced(JSON.stringify(value, null, 2), 'json')

const callMarkdown = (item: Extract<ThreadTextItem, { kind: 'call' }>, words: ToolCallWords) => {
  const parts = [
    ...(item.input == null ? [] : [`${words.input}:\n\n${json(item.input)}`]),
    ...(item.result == null ? [] : [`${words.result}:\n\n${json(item.result)}`]),
    ...(item.error == null || item.error === '' ? [] : [`${words.error}:\n\n${fenced(item.error)}`]),
  ]
  return [withStatus(withTime(code(item.name), item.time), item.status), ...parts].join('\n\n')
}

const messageMarkdown = (item: Extract<ThreadTextItem, { kind: 'message' }>) => [withStatus(withTime(`**${item.sender}**`, item.time), item.status), item.text].join('\n\n')

/**
 * A thread as Markdown, its last-resort text form for clients that read text, such as an MCP client or a language
 * model: each message under its sender in bold, each tool call as its name and status with its input and result as
 * JSON and its error in fenced code blocks, items apart by a rule.
 */
export const threadMarkdown = (items: ThreadTextItem[], words: ToolCallWords): string => items.map((item) => (item.kind === 'call' ? callMarkdown(item, words) : messageMarkdown(item))).join('\n\n---\n\n')
