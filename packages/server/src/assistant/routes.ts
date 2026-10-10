import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AssistantEvent } from '@protobase/schema'
import type { Meta } from '../meta'
import { badRequest, forbidden, HttpProblem, notFound } from '../problem'
import type { AdminEnv, Session } from '../types'
import { appContext } from './app-context'
import { seesAssistant, type ModelSettings } from './assistant-settings'
import { ask } from './built-in-assistant'
import { createConversations } from './conversations'

const maxQuestion = 4000

const userKey = (session: Session) => JSON.stringify([session.tenant ?? null, session.user.id])

const questionOf = (body: unknown) => {
  const text = typeof body === 'object' && body !== null ? (body as { text?: unknown }).text : undefined
  if (typeof text !== 'string' || !text.trim()) throw badRequest('invalid-message', 'The body must be { "text": "..." } with a question')
  if (text.length > maxQuestion) throw badRequest('invalid-message', `A question is at most ${maxQuestion} characters`)
  return text.trim()
}

/**
 * The built-in assistant under `/assistant`, speaking the assistant protocol on the app's own origin: answers to
 * questions about the app, for callers with the `admin` or `ai` role. It has no actions.
 */
export const assistantRoutes = (model: ModelSettings, meta: Meta, report?: (error: unknown) => void) => {
  const conversationOf = createConversations()
  const app = new Hono<AdminEnv>()

  app.use('/assistant/*', async (c, next) => {
    if (!seesAssistant(c.get('session').user.roles)) throw forbidden('assistant-forbidden', 'The assistant needs the admin or ai role')
    await next()
  })

  app.get('/assistant/events', (c) => {
    const conversation = conversationOf(userKey(c.get('session')))
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

  app.post('/assistant/messages', async (c) => {
    const session = c.get('session')
    const text = questionOf(await c.req.json())
    const conversation = conversationOf(userKey(session))
    if (conversation.state().replying) throw new HttpProblem(409, 'assistant-replying', 'Conflict', 'The assistant is still answering the last question')
    const { body } = await meta.forCaller(session)
    void ask(model, conversation, text, appContext(body.resources, body.views), report)
    return c.body(null, 202)
  })

  app.post('/assistant/actions', () => {
    throw notFound('The built-in assistant has no actions')
  })

  return app
}
