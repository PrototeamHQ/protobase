import { Hono } from 'hono'
import type { Db } from '@protobase/query'
import { ownSignInUser } from '../notifications/caller'
import { jsonBody, jsonOnly, limitedBody } from '../notifications/history-request'
import type { AdminEnv, Session } from '../types'
import { statusInput } from './status-input'
import { clearStatus, ownStatus, setStatus, visibleStatuses, type StatusTables } from './status-store'

// Each answer is one person's view at a path that is the same for everyone: no cache may keep it.
const noStore = { 'Cache-Control': 'no-store' }

// A visitor, or an outside app acting for the user, sees no one's status.
const viewerOf = (session: Session) => (session.anonymous || session.client ? undefined : String(session.user.id))

/**
 * The status endpoints, mounted at `statusPath` behind the API's authenticator: `GET /` the caller's own status,
 * `PUT /` sets it, `DELETE /` clears it, and `GET /people` the statuses of everyone who shares an organization with
 * the caller. No request names whose status it sets: the person comes from the session alone, and only someone
 * signed in as themselves sets theirs, never staff signed in as them (see `ownSignInUser`).
 */
export const statusRoutes = (db: Db, tables: StatusTables) => {
  const app = new Hono<AdminEnv>()

  app.get('/', async (c) => {
    const viewer = viewerOf(c.get('session'))
    const status = viewer === undefined ? undefined : await ownStatus(db, tables, viewer)
    return c.json({ status: status ?? null }, 200, noStore)
  })

  app.put('/', jsonOnly, limitedBody, async (c) => {
    const userId = ownSignInUser(c.get('session'), 'set their status')
    await setStatus(db, tables, userId, statusInput(await jsonBody(c)))
    return c.json({ status: (await ownStatus(db, tables, userId)) ?? null }, 200, noStore)
  })

  app.delete('/', async (c) => {
    await clearStatus(db, tables, ownSignInUser(c.get('session'), 'set their status'))
    return c.body(null, 204)
  })

  app.get('/people', async (c) => {
    const viewer = viewerOf(c.get('session'))
    return c.json({ statuses: viewer === undefined ? [] : await visibleStatuses(db, tables, viewer) }, 200, noStore)
  })

  return app
}
