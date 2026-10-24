import { Hono, type MiddlewareHandler } from 'hono'
import { z } from 'zod'
import { badRequest } from '../problem'
import type { AdminEnv } from '../types'
import { ownSignInUser } from './caller'
import { historyIdPattern, type StoredNotification } from './history'
import { historyCursor, historyPosition } from './history-cursor'
import { jsonBody, jsonOnly, limitedBody, queryOf } from './history-request'
import { maxHistoryPage, maxUnreadCount, type HistoryStore } from './history-store'
import { historyUrl } from './history-url'
import { historyIdParam } from './paths'

/** How many entries a page of the history holds when the request names no `limit`. */
export const defaultHistoryPage = 20

type HistoryEnv = AdminEnv & { Variables: { historyUser: string } }

// Before anything of the request is read: only the user signed in as themselves.
const ownSignIn: MiddlewareHandler<HistoryEnv> = async (c, next) => {
  c.set('historyUser', ownSignInUser(c.get('session')))
  await next()
}

// One user's inbox at a path that is the same for everyone: no cache may keep it.
const noStore = { 'Cache-Control': 'no-store' }

const pageLimit = (limit: string | undefined) => {
  if (limit === undefined) return defaultHistoryPage
  const value = /^[1-9][0-9]{0,2}$/.test(limit) ? Number(limit) : 0
  if (value < 1 || value > maxHistoryPage) throw badRequest('invalid-limit', `The limit is a whole number from 1 to ${maxHistoryPage}`)
  return value
}

const markAll = z.strictObject({ upTo: z.iso.datetime({ offset: true }) })

/**
 * The caller's own notification history, mounted at `historyPath` behind the API's authenticator: `GET /` a page of
 * it, newest first, `GET /unread` how many are unread, `POST /read` marks all read up to the newest the caller was
 * shown, `POST /<id>/read` one. No request names a user: each reaches the signed-in user's own entries alone. `origins`
 * are the app's own, which an absolute url may lead to.
 */
export const historyRoutes = (store: HistoryStore, origins: readonly string[]) => {
  const app = new Hono<HistoryEnv>()

  // What the caller learns of an entry, field by field, whatever else a store keeps.
  const answer = (entry: StoredNotification) => ({
    id: entry.id,
    title: entry.title,
    body: entry.body,
    url: historyUrl(entry.url, origins),
    data: entry.data,
    createdAt: entry.createdAt.toISOString(),
    readAt: entry.readAt === null ? null : entry.readAt.toISOString(),
  })

  app.get('/', ownSignIn, async (c) => {
    const userId = c.get('historyUser')
    const query = queryOf(c, ['cursor', 'limit'])
    const limit = pageLimit(query.limit)
    const before = query.cursor === undefined ? undefined : historyPosition(query.cursor)
    const entries = await store.list(userId, { ...(before && { before }), limit })
    // A store must answer with the caller's own entries alone: anything else is its fault, and shows nothing of them.
    if (entries.length > limit || entries.some((entry) => entry.userId !== userId || !historyIdPattern.test(entry.id))) throw new Error("The history store answered list with entries that are not the caller's")
    const last = entries.at(-1)
    const next = last && entries.length === limit ? historyCursor(last) : null
    return c.json({ items: entries.map(answer), next }, 200, noStore)
  })

  app.get('/unread', ownSignIn, async (c) => {
    queryOf(c, [])
    const count = await store.countUnread(c.get('historyUser'))
    if (!Number.isSafeInteger(count) || count < 0 || count > maxUnreadCount) throw new Error('The history store answered countUnread with no count')
    return c.json({ count }, 200, noStore)
  })

  app.post('/read', ownSignIn, jsonOnly, limitedBody, async (c) => {
    queryOf(c, [])
    const parsed = markAll.safeParse(await jsonBody(c))
    if (!parsed.success) throw badRequest('invalid-mark', 'Send { "upTo": <createdAt of the newest notification shown> }')
    await store.markAllRead(c.get('historyUser'), new Date(parsed.data.upTo))
    return c.body(null, 204)
  })

  // Answers alike whether the entry was the caller's, someone else's or none at all.
  app.post(`/:${historyIdParam}/read`, ownSignIn, jsonOnly, limitedBody, async (c) => {
    queryOf(c, [])
    const body = await jsonBody(c)
    if (body !== undefined && (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length > 0)) throw badRequest('invalid-mark', 'Marking one read takes no body')
    const id = c.req.param(historyIdParam)
    if (historyIdPattern.test(id)) await store.markRead(c.get('historyUser'), id)
    return c.body(null, 204)
  })

  return app
}
