import { Hono } from 'hono'
import { badRequest } from '../../problem'
import type { AdminEnv } from '../../types'
import { webhookParams } from './hook-paths'
import { issueWebhook, type IssueInput } from './issue-webhook'

/**
 * `POST <systemPath>/workflows/<id>/webhook` with an optional `{ secret }`: a new URL and secret for the workflow's
 * webhook trigger, answered once and never stored by any cache.
 */
export const issueRoute = (input: IssueInput) => {
  const app = new Hono<AdminEnv>()
  app.post(`/:${webhookParams.workflow}/webhook`, async (c) => {
    const text = await c.req.text()
    const body = (text === '' ? {} : JSON.parse(text)) as { secret?: unknown }
    if (typeof body !== 'object' || body === null || (body.secret !== undefined && typeof body.secret !== 'string')) throw badRequest('invalid-body', 'Send nothing, or { "secret": "<secret>" } to keep a secret the sender gives')
    const issued = await issueWebhook(input, c.get('session'), c.req.param(webhookParams.workflow), { ...(typeof body.secret === 'string' && { secret: body.secret }), origin: new URL(c.req.url).origin })
    return c.json(issued, 200, { 'Cache-Control': 'no-store' })
  })
  return app
}
