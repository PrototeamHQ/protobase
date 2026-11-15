import { Hono } from 'hono'
import type { AdminEnv } from '../../types'
import { parseCreateBody } from './create-body'
import { createWorkflow } from './create-workflow'
import { webhookParams } from './hook-paths'
import { parseIssueBody } from './issue-body'
import { issueWebhook, type IssueInput } from './issue-webhook'

/**
 * `POST <systemPath>/workflows/<id>/webhook` with an optional `{ secret }`: a new URL and secret for the workflow's
 * webhook trigger, answered once and never stored by any cache. `POST <systemPath>/workflows`: a workflow created as
 * `POST <basePath>/workflows` creates it, live in the same call with `publish`, its webhook URL and secret answered
 * once beside it.
 */
export const issueRoute = (input: IssueInput) => {
  const app = new Hono<AdminEnv>()
  app.post('/', async (c) => {
    const { fields, live } = parseCreateBody(await c.req.text())
    const { record, etag, webhook, webhookError } = await createWorkflow(input, c.get('session'), fields, { ...live, origin: new URL(c.req.url).origin })
    const location = `${input.deps().basePath}/workflows/${encodeURIComponent(String(record.id))}`
    return c.json({ ...record, etag, ...(webhook && { webhook }), ...(webhookError !== undefined && { webhook_error: webhookError }) }, 201, { Location: location, ETag: etag, 'Cache-Control': 'no-store' })
  })
  app.post(`/:${webhookParams.workflow}/webhook`, async (c) => {
    const body = parseIssueBody(await c.req.text())
    const issued = await issueWebhook(input, c.get('session'), c.req.param(webhookParams.workflow), { ...body, origin: new URL(c.req.url).origin })
    return c.json(issued, 200, { 'Cache-Control': 'no-store' })
  })
  return app
}
