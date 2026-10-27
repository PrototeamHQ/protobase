import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { Caller } from '../api-keys/resolve-caller'
import { isDatabaseError } from '../error-handler'
import type { BroadcastHub, Publication } from './broadcast-hub'
import { batchOf, broadcastProblem, publicationOf } from './broadcast-request'
import type { ChannelAccess } from './channel-access'
import { realtimeLimits } from './realtime-limits'

export type BroadcastApiOptions = {
  caller: (request: Request) => Promise<Caller>
  broadcasts: BroadcastHub
  access: ChannelAccess
  report: (error: unknown) => void
}

type CallerEnv = { Variables: { caller: Caller } }

const tooFast = () => broadcastProblem(429, 'too-many-broadcasts', 'Too Many Requests', 'Too many messages per second on this topic')

// The content type without its parameters.
const typeOf = (c: Context) => c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase()

const parsedJson = async (c: Context) => {
  try {
    return JSON.parse(await c.req.text()) as unknown
  } catch (error) {
    if (error instanceof SyntaxError) throw broadcastProblem(400, 'invalid-json', 'Bad Request', 'The body is not JSON')
    throw error
  }
}

/**
 * `POST /api/broadcast` and `POST /api/broadcast/:topic/events/:event`, Supabase Realtime's broadcast API, which
 * supabase-js's `send()` on a channel that has not joined and `httpSend()` call: they send to the channels joined on a
 * topic in this process, as a broadcast sent on the socket, under the same topic rate. A request is admitted by the
 * app's key and the token in its bearer, as the socket is, and its body is at most a socket's frame. A private message
 * reaches private channels only, and only when the caller may send broadcasts on its topic by the policies on
 * `realtime.messages`: the batch drops one it may not, as Supabase does, and the single message is refused with 403.
 */
export const broadcastApi = ({ caller, broadcasts, access, report }: BroadcastApiOptions) => {
  const app = new Hono<CallerEnv>()

  const admitted: MiddlewareHandler<CallerEnv> = async (c, next) => {
    c.set('caller', await caller(c.req.raw))
    await next()
  }
  const limited = bodyLimit({
    maxSize: realtimeLimits.maxFrameBytes,
    onError: () => {
      throw broadcastProblem(413, 'too-large', 'Payload Too Large', `A broadcast request is at most ${realtimeLimits.maxFrameBytes} bytes`)
    },
  })

  // A policy that fails, such as one calling a function that raises, allows nothing, as on a private channel.
  const mayWrite = (who: Caller, topic: string) =>
    access.write(who, topic.replace(/^realtime:/, ''), 'broadcast').catch((error: unknown) => {
      if (!isDatabaseError(error)) throw error
      report(error)
      return false
    })

  // One check per private topic, one after another so a batch holds one connection at a time.
  const allowed = async (who: Caller, publications: readonly Publication[]) => {
    const topics = new Map<string, boolean>()
    for (const { topic } of publications.filter((publication) => publication.private)) {
      if (!topics.has(topic)) topics.set(topic, await mayWrite(who, topic))
    }
    return publications.filter((publication) => !publication.private || topics.get(publication.topic))
  }

  app.post('/', admitted, limited, async (c) => {
    if (typeOf(c) !== 'application/json') throw broadcastProblem(415, 'json-only', 'Unsupported Media Type', 'Send the messages as application/json')
    const publications = await allowed(c.var.caller, batchOf(await parsedJson(c)))
    if (!broadcasts.publish(publications)) throw tooFast()
    return c.body(null, 202)
  })

  app.post('/:topic/events/:event', admitted, limited, async (c) => {
    const type = typeOf(c)
    if (type !== 'application/json' && type !== 'application/octet-stream') {
      throw broadcastProblem(415, 'unsupported-payload', 'Unsupported Media Type', 'Send the payload as application/json or application/octet-stream')
    }
    const payload = type === 'application/json' ? await parsedJson(c) : await c.req.arrayBuffer()
    if (type === 'application/json' && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
      throw broadcastProblem(422, 'invalid-broadcast', 'Unprocessable Content', 'Payload must be a JSON object')
    }
    const publication = publicationOf(c.req.param('topic'), c.req.param('event'), payload, c.req.query('private') === 'true')
    if ((await allowed(c.var.caller, [publication])).length === 0) throw broadcastProblem(403, 'unauthorized', 'Forbidden', 'Unauthorized')
    if (!broadcasts.publish([publication])) throw tooFast()
    return c.body(null, 202)
  })

  return app
}
