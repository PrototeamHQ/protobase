import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fetchMaxBytes, ResponseTooLargeError, type PluginFetch } from '@protobase/workflows/plugin'
import { recording } from './recordings'

// The answers below follow those recorded from a real Gmail mailbox (`./recordings`): the 401 and 404 answers and the
// system labels are the recorded ones, and every other answer has its recording's shape, which
// packages/workflow-plugins/src/gmail/fake-gmail.test.ts checks. What a recording cannot show, such as paging, a
// history Google no longer keeps or a mailbox's own labels, follows Google's public Gmail API reference.

/** A request the fake took: its method, its path below the API, its query and the token it carried. */
export type GmailCall = { method: string; origin: string; path: string; query: URLSearchParams; token: string | undefined }

type Mail = { id: string; threadId: string; labelIds: string[]; raw: Uint8Array; internalDate: number }
type Record_ = { id: number; messages: string[] }
type Answer = { status: number; body?: unknown; headers?: Record<string, string> }

const json = ({ status, body, headers }: Answer) => new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

// Gmail's answers to a message it has not and to a token it refuses, as recorded.
const recorded = (name: 'message-not-found' | 'unauthenticated'): Answer => {
  const { status, body } = recording(name).response
  return { status, body }
}

// Google's error shape, for an answer no recording shows: https://cloud.google.com/apis/design/errors.
const googleError = (code: number, status: string, message: string): Answer => ({ status: code, body: { error: { code, message, status, errors: [{ message, domain: 'global', reason: status.toLowerCase() }] } } })

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

// The header lines of a raw mail, unfolded.
const headerLines = (raw: Uint8Array) => {
  const text = new TextDecoder().decode(raw)
  const end = text.search(/\r?\n\r?\n/)
  return (end === -1 ? text : text.slice(0, end)).replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).map((line) => {
    const colon = line.indexOf(':')
    return { name: line.slice(0, colon), value: line.slice(colon + 1).trim() }
  })
}

/**
 * Gmail's API for one mailbox on this machine: mail added through `deliver` lands in its history, which `history.list`
 * pages through and which `expireHistory` makes answer 404 below a point. Only a token in `tokens` is let in; any other
 * gets 401. `failNext` answers the next call of a path as given. Every call is kept in `calls`.
 */
export const fakeGmail = () => {
  let origin = 'https://gmail.fake'
  const mails = new Map<string, Mail>()
  const records: Record_[] = []
  // The recorded system labels, and one of the mailbox's own, as Google's reference shows them.
  const labels = [...(recording('labels').response.body as { labels: object[] }).labels, { id: 'Label_7', name: 'Invoices', type: 'user', messageListVisibility: 'show', labelListVisibility: 'labelShow' }]
  const calls: GmailCall[] = []
  // Deleted messages stay in the history, as Gmail's do, but getting one answers 404.
  const deleted = new Set<string>()
  const tokens = new Set<string>(['token-1'])
  const failures: { path: RegExp; answer: Answer }[] = []
  let current = 1000
  let expiredBelow = 0
  let nextId = 1
  /** Records per `history.list` page, below the `maxResults` asked; Google may give fewer than asked. */
  let pageSize: number | undefined

  /** Adds one history record holding `raws`, each a new message with `labelIds`; returns the message ids. */
  const deliver = (raws: (string | Uint8Array)[], { labelIds = ['INBOX'], at = 1_800_000_000 }: { labelIds?: string[]; at?: number } = {}) => {
    const ids = raws.map((raw) => {
      const id = (nextId++).toString(16).padStart(16, '0')
      mails.set(id, { id, threadId: id, labelIds, raw: typeof raw === 'string' ? new TextEncoder().encode(raw) : raw, internalDate: at })
      return id
    })
    current += 1
    records.push({ id: current, messages: ids })
    return ids
  }

  const page = <T>(list: T[], token: string | null, size: number) => {
    const from = token === null ? 0 : Number(token.replace('page-', ''))
    const next = from + size < list.length ? `page-${from + size}` : undefined
    return { items: list.slice(from, from + size), next }
  }

  const route = (path: string, query: URLSearchParams): Answer => {
    if (path === 'profile') return { status: 200, body: { emailAddress: 'mailbox@example.com', messagesTotal: mails.size, threadsTotal: mails.size, historyId: String(current) } }
    if (path === 'labels') return { status: 200, body: { labels } }
    if (path === 'history') {
      const start = Number(query.get('startHistoryId'))
      if (start < expiredBelow) return recorded('message-not-found')
      const label = query.get('labelId')
      const matching = records
        .filter((record) => record.id > start)
        .map((record) => ({ ...record, messages: record.messages.filter((id) => label === null || mails.get(id)!.labelIds.includes(label)) }))
        .filter((record) => record.messages.length > 0)
      const { items, next } = page(matching, query.get('pageToken'), pageSize ?? Number(query.get('maxResults') ?? 100))
      const history = items.map((record) => ({
        id: String(record.id),
        messages: record.messages.map((id) => ({ id, threadId: mails.get(id)!.threadId })),
        messagesAdded: record.messages.map((id) => ({ message: { id, threadId: mails.get(id)!.threadId, labelIds: mails.get(id)!.labelIds } })),
      }))
      return { status: 200, body: { ...(history.length > 0 && { history }), ...(next && { nextPageToken: next }), historyId: String(current) } }
    }
    if (path === 'messages') {
      const label = query.get('labelIds')
      const after = Number(/^after:(\d+)$/.exec(query.get('q') ?? '')?.[1] ?? 0)
      const listed = [...mails.values()].filter((mail) => !deleted.has(mail.id) && (label === null || mail.labelIds.includes(label)) && mail.internalDate > after).reverse()
      const { items, next } = page(listed, query.get('pageToken'), Number(query.get('maxResults') ?? 100))
      return { status: 200, body: { ...(items.length > 0 && { messages: items.map(({ id, threadId }) => ({ id, threadId })) }), ...(next && { nextPageToken: next }), resultSizeEstimate: listed.length } }
    }
    const message = /^messages\/([^/]+)$/.exec(path)
    if (message) {
      const mail = mails.get(message[1]!)
      if (!mail || deleted.has(mail.id)) return recorded('message-not-found')
      const base = { id: mail.id, threadId: mail.threadId, labelIds: mail.labelIds, snippet: '', historyId: String(current), internalDate: String(mail.internalDate * 1000), sizeEstimate: mail.raw.length }
      if (query.get('format') === 'raw') return { status: 200, body: { ...base, raw: base64url(mail.raw) } }
      const wanted = query.getAll('metadataHeaders').map((name) => name.toLowerCase())
      return { status: 200, body: { ...base, payload: { mimeType: 'multipart/mixed', headers: headerLines(mail.raw).filter(({ name }) => wanted.includes(name.toLowerCase())) } } }
    }
    return recorded('message-not-found')
  }

  const handle = async (request: Request) => {
    const url = new URL(request.url)
    const path = url.pathname.replace(/^\/gmail\/v1\/users\/me\//, '')
    const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
    calls.push({ method: request.method, origin: url.origin, path, query: url.searchParams, token })
    if (url.origin !== origin) return json({ status: 200, body: { reached: 'elsewhere' } })
    if (token === undefined || !tokens.has(token)) return json(recorded('unauthenticated'))
    const failure = failures.findIndex((entry) => entry.path.test(path))
    if (failure !== -1) return json(failures.splice(failure, 1)[0]!.answer)
    if (request.method !== 'GET') return json(googleError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed'))
    return json(route(path, url.searchParams))
  }

  /** The plugin context's `fetch` against this fake in-process, reading at most `maxBytes` of an answer as the real one does. */
  const fetch: PluginFetch = async (url, init = {}) => {
    const answer = await handle(new Request(url, { method: init.method ?? 'GET', ...(init.headers && { headers: init.headers }) }))
    const bytes = new Uint8Array(await answer.arrayBuffer())
    const most = Math.min(init.maxBytes ?? fetchMaxBytes, fetchMaxBytes)
    if (bytes.length > most) throw new ResponseTooLargeError(most)
    return new Response(bytes, { status: answer.status, headers: answer.headers })
  }

  /** Serves the fake on 127.0.0.1, for a test that reaches it through the server's own guarded fetch. */
  const serve = async () => {
    const server = createServer(async (incoming, outgoing) => {
      const host = `http://${incoming.headers.host}`
      const answer = await handle(new Request(new URL(incoming.url ?? '/', host), { method: incoming.method ?? 'GET', headers: Object.entries(incoming.headers).flatMap(([name, value]) => (typeof value === 'string' ? [[name, value] as [string, string]] : [])) }))
      outgoing.writeHead(answer.status, Object.fromEntries(answer.headers)).end(Buffer.from(await answer.arrayBuffer()))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    return { url: origin, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
  }

  return {
    get origin() {
      return origin
    },
    calls,
    tokens,
    deliver,
    fetch,
    handle,
    serve,
    /** The calls to a path below the API. */
    callsTo: (path: string | RegExp) => calls.filter((call) => (typeof path === 'string' ? call.path === path : path.test(call.path))),
    /** Answers the next call whose path matches `path` with `answer`, once. */
    failNext: (path: RegExp, answer: Answer) => void failures.push({ path, answer }),
    googleError,
    /** History ids below the current one answer 404 from now on, as Google's do once they are no longer kept. */
    expireHistory: () => void (expiredBelow = current),
    /** Deletes a message, so getting it answers 404. */
    remove: (id: string) => void deleted.add(id),
    setPageSize: (size: number | undefined) => void (pageSize = size),
    get historyId() {
      return String(current)
    },
  }
}

export type FakeGmail = ReturnType<typeof fakeGmail>
