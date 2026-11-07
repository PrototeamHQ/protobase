import { gmailId, historyId, type GmailApi } from './api'

/** A message as a list gives it: its id and its thread's. */
export type MessageRef = { id: string; threadId: string }

const bad = (call: string) => new Error(`Gmail ${call} answered an unexpected shape`)

const pageToken = (value: unknown, call: string) => {
  if (value === undefined) return
  if (typeof value !== 'string' || value.length === 0 || value.length > 1000) throw bad(call)
  return value
}

const messageRef = (value: unknown, call: string): MessageRef => {
  const { id, threadId } = (value ?? {}) as { id?: unknown; threadId?: unknown }
  if (typeof id !== 'string' || !gmailId.test(id) || typeof threadId !== 'string' || !gmailId.test(threadId)) throw bad(call)
  return { id, threadId }
}

// `atob` runs on every runtime the server does; it takes the standard alphabet.
const base64url = (text: string) => {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const list = (value: unknown, call: string): unknown[] => {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw bad(call)
  return value
}

/** The mailbox's current history id (`users.getProfile`). */
export const profile = async (api: GmailApi) => {
  const body = (await api.get('profile', [], 'getProfile')) as { historyId?: unknown }
  if (typeof body.historyId !== 'string' || !historyId.test(body.historyId)) throw bad('getProfile')
  return body.historyId
}

/** The mailbox's labels, by id and name (`users.labels.list`). */
export const labels = async (api: GmailApi) => {
  const body = (await api.get('labels', [], 'labels.list')) as { labels?: unknown }
  return list(body.labels, 'labels.list').map((label) => {
    const { id, name } = (label ?? {}) as { id?: unknown; name?: unknown }
    if (typeof id !== 'string' || typeof name !== 'string') throw bad('labels.list')
    return { id, name }
  })
}

/** One history record: its id, and the messages added in it. */
export type HistoryRecord = { id: string; added: MessageRef[] }

/** One page of the added messages after `start` on `label` (`users.history.list`). */
export const historyPage = async (api: GmailApi, { start, label, page }: { start: string; label: string; page: string | undefined }) => {
  const call = 'history.list'
  const body = (await api.get('history', [['startHistoryId', start], ['historyTypes', 'messageAdded'], ['labelId', label], ['maxResults', '100'], ['pageToken', page]], call)) as { history?: unknown; nextPageToken?: unknown; historyId?: unknown }
  if (typeof body.historyId !== 'string' || !historyId.test(body.historyId)) throw bad(call)
  const records = list(body.history, call).map((record): HistoryRecord => {
    const { id, messagesAdded } = (record ?? {}) as { id?: unknown; messagesAdded?: unknown }
    if (typeof id !== 'string' || !historyId.test(id)) throw bad(call)
    return { id, added: list(messagesAdded, call).map((added) => messageRef((added as { message?: unknown } | null)?.message, call)) }
  })
  return { records, next: pageToken(body.nextPageToken, call), historyId: body.historyId }
}

/** One page of at most `limit` messages on `label` after the time `since`, in seconds (`users.messages.list`). */
export const messagesPage = async (api: GmailApi, { label, since, page, limit }: { label: string; since: number; page: string | undefined; limit: number }) => {
  const call = 'messages.list'
  const body = (await api.get('messages', [['labelIds', label], ['q', `after:${since}`], ['maxResults', String(limit)], ['pageToken', page]], call)) as { messages?: unknown; nextPageToken?: unknown }
  return { messages: list(body.messages, call).map((message) => messageRef(message, call)), next: pageToken(body.nextPageToken, call) }
}

/** The headers a message's metadata gives, for a mail too large to read whole. */
export const metadataHeaders = ['From', 'To', 'Cc', 'Subject', 'Date'] as const

/** A message's whole RFC 822 source (`users.messages.get`, `format=raw`), at most `maxBytes` of answer. */
export const rawMessage = async (api: GmailApi, id: string, maxBytes: number) => {
  const call = 'messages.get'
  const body = (await api.get(`messages/${encodeURIComponent(id)}`, [['format', 'raw']], call, maxBytes)) as { raw?: unknown }
  if (typeof body.raw !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(body.raw)) throw bad(call)
  return base64url(body.raw)
}

/** A message's headers alone (`users.messages.get`, `format=metadata`). */
export const messageHeaders = async (api: GmailApi, id: string) => {
  const call = 'messages.get'
  const query: [string, string][] = [['format', 'metadata'], ...metadataHeaders.map((name): [string, string] => ['metadataHeaders', name])]
  const body = (await api.get(`messages/${encodeURIComponent(id)}`, query, call)) as { payload?: { headers?: unknown } }
  return list(body.payload?.headers, call).map((header) => {
    const { name, value } = (header ?? {}) as { name?: unknown; value?: unknown }
    if (typeof name !== 'string' || typeof value !== 'string') throw bad(call)
    return { name, value }
  })
}
