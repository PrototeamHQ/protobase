import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { jsonBody, jsonOnly } from '../notifications/history-request'
import { HttpProblem, unauthorized } from '../problem'
import { presenceReport, type PresenceReport } from './presence-report'

/** Where the relay posts its presence reports, under the system path. */
export const relayPresencePath = (systemPath: string) => `${systemPath}/relay/presence`

// 500 changes of user ids up to a few hundred bytes each.
const maxBodyBytes = 256 * 1024

const digest = (text: string) => createHash('sha256').update(text).digest()

// Compared as digests, so neither the time taken nor a length difference tells anything about the key.
const sameKey = (given: string | undefined, key: string) => given !== undefined && timingSafeEqual(digest(given), digest(key))

/**
 * `POST /` with a presence report of the relay, `{ started, changes: [{ user, status, at }] }`, carrying the presence
 * key as its bearer token, never a person's sign-in: writes it and answers `204`, which tells the relay it was taken.
 */
export const presenceRoutes = ({ key, record }: { key: string; record: (report: PresenceReport) => Promise<void> }) =>
  new Hono().post(
    '/',
    async (c, next) => {
      if (!sameKey(c.req.header('authorization')?.replace(/^Bearer /, ''), key)) throw unauthorized('Send the presence key as a bearer token')
      await next()
    },
    jsonOnly,
    bodyLimit({ maxSize: maxBodyBytes, onError: () => { throw new HttpProblem(413, 'too-large', 'Payload Too Large', `The body is larger than ${maxBodyBytes} bytes`) } }),
    async (c) => {
      await record(presenceReport(await jsonBody(c)))
      return c.body(null, 204)
    },
  )
