import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AssistantEvent, AssistantMessageRequest } from '@protobase/schema'
import { createErrorHandler } from '../error-handler'
import { badRequest, forbidden, HttpProblem, notFound } from '../problem'
import type { Authenticator, Session } from '../types'
import type { Conversation } from './conversations'

export type AssistantBackend = {
  /** Resolves the caller from the request's bearer token, or throws a 401 problem. */
  authenticate: Authenticator
  /** Whether the caller may use the assistant; others get 403. */
  allows: (session: Session) => boolean
  conversationOf: (session: Session) => Conversation | Promise<Conversation>
  /** Answers a message of the user with events on the conversation; called only while the backend is not replying. */
  onMessage: (message: AssistantMessageRequest, session: Session, conversation: Conversation) => Promise<void>
  /** Gets errors of `onMessage` and of requests that become a 500. */
  report?: (error: unknown) => void
  /** The longest message accepted. Default 4000. */
  maxMessageLength?: number
}

const isObject = (body: unknown): body is Record<string, unknown> => typeof body === 'object' && body !== null

const maxPageLength = 2000

const messageOf = (body: unknown, max: number): AssistantMessageRequest => {
  const { text, page } = isObject(body) ? body : {}
  if (typeof text !== 'string' || !text.trim()) throw badRequest('invalid-message', 'The body must be { "text": "..." }')
  if (text.length > max) throw badRequest('invalid-message', `A message is at most ${max} characters`)
  if (page !== undefined && (typeof page !== 'string' || page.length > maxPageLength)) throw badRequest('invalid-message', `"page" must be a path of at most ${maxPageLength} characters`)
  return { text: text.trim(), ...(page && { page }) }
}

const actionOf = (body: unknown) => {
  const { partId, actionId } = isObject(body) ? body : {}
  if (typeof partId !== 'string' || typeof actionId !== 'string') throw badRequest('invalid-action', 'The body must be { "partId": "...", "actionId": "..." }')
  return { partId, actionId }
}

/**
 * The assistant protocol's requests as a Hono app: `GET /events` (the event stream, a `state` event first),
 * `POST /messages` and `POST /actions`. Mount it where `/api/meta` says the backend is.
 */
export const assistantProtocolRoutes = (backend: AssistantBackend) => {
  const app = new Hono<{ Variables: { session: Session } }>()
  app.onError(createErrorHandler(backend.report))
  app.use('*', async (c, next) => {
    const session = await backend.authenticate(c.req.raw)
    if (!backend.allows(session)) throw forbidden('assistant-forbidden', 'The assistant needs the admin or ai role')
    c.set('session', session)
    await next()
  })

  app.get('/events', async (c) => {
    const conversation = await backend.conversationOf(c.get('session'))
    return streamSSE(c, async (stream) => {
      const queue: AssistantEvent[] = [{ type: 'state', state: conversation.state() }]
      let wake = () => {}
      const unsubscribe = conversation.subscribe((event) => {
        queue.push(event)
        wake()
      })
      stream.onAbort(() => {
        unsubscribe()
        wake()
      })
      while (!stream.aborted) {
        const event = queue.shift()
        if (event) await stream.writeSSE({ data: JSON.stringify(event) })
        else await new Promise<void>((resolve) => (wake = resolve))
      }
    })
  })

  app.post('/messages', async (c) => {
    const session = c.get('session')
    const message = messageOf(await c.req.json(), backend.maxMessageLength ?? 4000)
    const conversation = await backend.conversationOf(session)
    if (conversation.state().replying) throw new HttpProblem(409, 'assistant-replying', 'Conflict', 'The assistant is still answering')
    void backend.onMessage(message, session, conversation).catch((error: unknown) => backend.report?.(error))
    return c.body(null, 202)
  })

  app.post('/actions', async (c) => {
    const { partId, actionId } = actionOf(await c.req.json())
    if (!(await backend.conversationOf(c.get('session'))).act(partId, actionId)) throw notFound('No card waits for that action')
    return c.body(null, 202)
  })

  return app
}
