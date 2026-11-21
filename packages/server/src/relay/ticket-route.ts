import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { anonymousSession } from '../anonymous'
import { channelRecord } from '../channels/channel-name'
import { recordReadable } from '../channels/record-readable'
import type { Deps } from '../deps'
import { jsonBody, jsonOnly } from '../notifications/history-request'
import { badRequest, forbidden, HttpProblem, notFound } from '../problem'
import type { AdminEnv, Session } from '../types'
import { memberships } from './members-sql'
import { peopleChannel } from './presence-commands'
import type { RelayJobs } from './relay-jobs'
import type { RelayModels } from './relay-models'
import type { RealtimeRelayOptions } from './relay-options'
import { signTicket, type TicketSubject } from './ticket'

/** Where the ticket endpoint is mounted under the system path. */
export const relayTicketPath = (systemPath: string) => `${systemPath}/relay/ticket`

/** The most channels one ticket lists, as the relay takes by default. */
export const maxTicketChannels = 200

const maxBodyBytes = 16 * 1024

/** The relay's socket address, which a client connects to with its ticket. */
export const relaySocketUrl = (url: string) => `${url.replace(/\/+$/, '').replace(/^http/, 'ws')}/socket`

const noStore = { 'Cache-Control': 'no-store' }

const requestedChannels = (body: unknown) => {
  if (body === undefined) return []
  const channels = (body as { channels?: unknown })?.channels
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw badRequest('invalid-body', 'The body is { channels?: string[] }')
  if (channels === undefined) return []
  if (!Array.isArray(channels) || !channels.every((name) => typeof name === 'string')) throw badRequest('invalid-channels', 'channels is a list of channel names, <resource>/<key>')
  if (channels.length > maxTicketChannels) throw badRequest('too-many-channels', `A ticket lists at most ${maxTicketChannels} channels`)
  return [...new Set(channels as string[])]
}

type TicketRouteInput = { deps: Deps; options: RealtimeRelayOptions; models: RelayModels; jobs: RelayJobs; sessionEnd: (session: string) => Promise<Date | undefined> }

/**
 * `POST /` with `{ channels?: [...] }`: a connect ticket for the relay, `{ ticket, url, channels, expiresAt }`, with the
 * channels it lists, the same list as its claims. A signed-in person's ticket names their sign-in session, so a device
 * that connects adds no session, and lists every channel they are a member of, as the members resources have it, and
 * `people`, which every signed-in person has and their contacts' presence is published on; a visitor's names an
 * anonymous session of its own and only receives. Both list the open channels asked for whose records are public, read
 * by the anonymous role, as a read of the record decides it; one there is none of, one that is not public and one of a
 * resource with members are refused alike with `404`. A signed-in person's ticket queues the close of their session's
 * sockets at its expiry, once for each session.
 */
export const ticketRoutes = ({ deps, options, models, jobs, sessionEnd }: TicketRouteInput) => {
  const app = new Hono<AdminEnv>()

  // An open channel of a public record, one a visitor may read, so no one's own access to it can end while their
  // socket stays open; anything else answers as for no record at all.
  const openChannel = async (name: string) => {
    const slash = name.indexOf('/')
    const resource = slash < 0 ? '' : name.slice(0, slash)
    const refuse = () => notFound(`There is no channel ${name}`)
    const channel = models.channels.get(resource)
    if (!channel || channel.members) throw refuse()
    const record = channelRecord(deps.registry, resource, name.slice(slash + 1))
    if (record === undefined || record === 'too-long' || record.name !== name) throw refuse()
    if (!(await recordReadable(deps, anonymousSession(), record))) throw refuse()
    return name
  }

  const subjectOf = async (session: Session): Promise<TicketSubject> => {
    if (session.anonymous) return { anonymous: true, session: `anonymous:${crypto.randomUUID()}` }
    const id = session.signIn?.session
    if (session.client || typeof id !== 'string' || id === '') throw forbidden('sign-in-session-required', 'A ticket is for someone signed in with a session of the app, or a visitor')
    const end = await sessionEnd(id)
    if (!end || end.getTime() <= Date.now()) throw new HttpProblem(401, 'session-ended', 'Unauthorized', 'The sign-in session has ended')
    await jobs.watchSession(deps.db, id, end)
    return { user: String(session.user.id), session: id }
  }

  app.post('/', jsonOnly, bodyLimit({ maxSize: maxBodyBytes, onError: () => { throw new HttpProblem(413, 'too-large', 'Payload Too Large', `The body is larger than ${maxBodyBytes} bytes`) } }), async (c) => {
    const session = c.get('session')
    const asked = requestedChannels(await jsonBody(c))
    // One read at a time, so a long list holds one connection of the pool.
    const open: string[] = []
    for (const name of asked) open.push(await openChannel(name))
    const subject = await subjectOf(session)
    const member = 'user' in subject ? [peopleChannel, ...(await memberships(deps.db, models, subject.user))] : []
    const channels = [...new Set([...member, ...open])]
    if (channels.length > maxTicketChannels) throw new HttpProblem(422, 'too-many-channels', 'Unprocessable Content', `The ticket would list ${channels.length} channels, over the ${maxTicketChannels} the relay takes`)
    const { ticket, expiresAt } = await signTicket(options, subject, channels)
    return c.json({ ticket, url: relaySocketUrl(options.url), channels, expiresAt: expiresAt.toISOString() }, 200, noStore)
  })

  return app
}
