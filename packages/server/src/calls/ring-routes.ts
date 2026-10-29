import { Hono } from 'hono'
import { declineWord } from '@protobase/schema/internal'
import type { AdminEnv, Session } from '../types'
import type { CallsService } from './calls-service-type'
import { isCallId } from './call-store'

// Each answer is one person's rings at a path that is the same for everyone: no cache may keep it.
const noStore = { 'Cache-Control': 'no-store' }

// A visitor, or an outside app acting for the user, is rung by no call.
const userOf = (session: Session) => (session.anonymous || session.client ? undefined : String(session.user.id))

/**
 * The rings of the signed-in user, mounted at `ringsPath` behind the API's authenticator: `GET /` the calls that ring
 * them now, newest first, and `POST /{call}/decline` stops a call ringing them, on every page they have open. The
 * user comes from the session alone.
 */
export const ringRoutes = (calls: CallsService) => {
  const app = new Hono<AdminEnv>()

  app.get('/', async (c) => {
    const user = userOf(c.get('session'))
    const items = user === undefined ? [] : await (await calls.runtime()).rings().of(user)
    return c.json({ items }, 200, noStore)
  })

  app.post(`/:call/${declineWord}`, async (c) => {
    const user = userOf(c.get('session'))
    const call = c.req.param('call')
    if (user !== undefined && isCallId(call)) await (await calls.runtime()).rings().stop(call, user)
    return c.body(null, 204)
  })

  return app
}
