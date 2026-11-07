import { Hono } from 'hono'
import type { AdminEnv } from '../../types'
import { webhookParams } from './hook-paths'
import { parseIssueBody } from './issue-body'
import { issueWebhook, type IssueInput } from './issue-webhook'

/**
 * `POST <systemPath>/workflows/<id>/webhook` with an optional `{ secret }`: a new URL and secret for the workflow's
 * webhook trigger, answered once and never stored by any cache.
 */
export const issueRoute = (input: IssueInput) => {
  const app = new Hono<AdminEnv>()
  app.post(`/:${webhookParams.workflow}/webhook`, async (c) => {
    const body = parseIssueBody(await c.req.text())
    const issued = await issueWebhook(input, c.get('session'), c.req.param(webhookParams.workflow), { ...body, origin: new URL(c.req.url).origin })
    return c.json(issued, 200, { 'Cache-Control': 'no-store' })
  })
  return app
}
