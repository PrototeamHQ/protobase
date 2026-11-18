import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { badRequest, HttpProblem } from '../../problem'
import type { UnsubscribeLinks } from './unsubscribe-links'
import { confirmPage, donePage } from './unsubscribe-page'
import type { UnsubscribeTarget } from './unsubscribe-token'

// The one-click form is one short field.
const smallBody = bodyLimit({
  maxSize: 1024,
  onError: () => {
    throw new HttpProblem(413, 'too-large', 'Payload Too Large', 'The body is larger than 1024 bytes')
  },
})

// Neither page may be kept by a cache, nor show which address a link is for to anyone the link was not sent to.
const noStore = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

/**
 * The one-click unsubscribe of RFC 8058, without sign-in, at `<path>/<token>`: `POST` with the form field
 * `List-Unsubscribe=One-Click` records that the token's recipient unsubscribed from its topic and answers `200`; `GET`
 * shows a page whose button sends that `POST`, and records nothing. A token the app did not sign answers `400`.
 * `record` keeps the opt-out, and changes nothing for one already kept.
 */
export const unsubscribeRoutes = (links: UnsubscribeLinks, record: (target: UnsubscribeTarget) => Promise<void>) => {
  const app = new Hono()
  const target = (token: string) => {
    const read = links.read(token)
    if (!read) throw badRequest('invalid-unsubscribe-link', 'This unsubscribe link is not valid')
    return read
  }

  app.get('/:token', (c) => c.html(confirmPage(target(c.req.param('token'))), 200, noStore))

  app.post('/:token', smallBody, async (c) => {
    const read = target(c.req.param('token'))
    const form = await c.req.parseBody()
    if (form['List-Unsubscribe'] !== 'One-Click') throw badRequest('invalid-unsubscribe-request', 'Send the form field List-Unsubscribe=One-Click')
    await record(read)
    return c.html(donePage(read), 200, noStore)
  })

  return app
}
