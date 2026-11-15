import { badRequest, forbidden, HttpProblem } from '../../problem'
import { requestAccess } from '../../request-access'
import type { Row, Session } from '../../types'
import { runWrite } from '../../write-pipeline'
import { hookMode, hookSecret } from './hook-secrets'
import { issueWebhook, type IssueInput } from './issue-webhook'

/** What a create goes live with: version 1 published, and with a webhook trigger the sender's own secret, if it makes one. */
export type GoLive = { publish?: boolean; secret?: string }

/**
 * A workflow created: its row and ETag, and the URL and secret of its webhook trigger when the create issued them, shown
 * once, or why they could not be issued once it was saved.
 */
export type CreatedWorkflow = { record: Row; etag: string; webhook?: { url: string; secret: string }; webhookError?: string }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The webhook trigger of a definition's `trigger` whose sender is given a URL, such as app:webhook, with its input;
 * undefined for any other trigger, such as a manual one or one that registers its own URL with its service.
 */
export const urlTrigger = (webhooks: IssueInput['webhooks'], trigger: unknown) => {
  const [type, input] = isObject(trigger) ? (Object.entries(trigger)[0] ?? []) : []
  const found = type === undefined ? undefined : webhooks(type)
  return found && !found.subscribe ? { type: type!, input: isObject(input) ? input : {} } : undefined
}

/** Whether the caller may change workflows, which issuing a webhook URL needs, as issuing it later does. */
export const mayIssueWebhook = async (input: Pick<IssueInput, 'deps'>, session: Session) => (await requestAccess(input.deps(), input.deps().registry.find('workflows')!, session)).resolved.operations.update

/**
 * Whether a create can go live as asked, checked before anything is saved: a secret only for a webhook trigger that is
 * published, and one its auth mode can check.
 */
export const checkGoLive = (webhooks: IssueInput['webhooks'], trigger: unknown, live: GoLive) => {
  const hook = live.publish ? urlTrigger(webhooks, trigger) : undefined
  if (live.secret === undefined) return hook
  if (!hook) throw badRequest('not-a-webhook', 'webhook_secret goes with publish, for a workflow that starts from a webhook trigger whose sender is given a URL, such as app:webhook')
  const mode = hookMode(hook.input)
  if (mode) hookSecret(mode, live.secret)
  return hook
}

/**
 * Creates a workflow as `POST <basePath>/workflows` does, as the caller, through the save check and the write hooks;
 * with `publish`, version 1 is published in the same write, which puts its trigger on it; and when that trigger is a
 * webhook whose sender is given a URL, the URL and secret are issued too and answered once. Whether it can go live as
 * asked is checked first, so a refusal saves nothing; a URL the app could not issue after the save leaves the workflow
 * live without one, saying why, which `POST .../workflows/<id>/webhook` issues.
 */
export const createWorkflow = async (input: IssueInput, session: Session, body: Row, live: GoLive & { origin: string }): Promise<CreatedWorkflow> => {
  // Only publish publishes here: a create that only saves leaves the workflow off
  if (!live.publish && body.enabled_version !== undefined && body.enabled_version !== null) throw badRequest('publish-required', 'enabled_version publishes the workflow: send publish: true, or leave enabled_version out to only save it')
  const hook = checkGoLive(input.webhooks, body.trigger, live)
  const entry = input.deps().registry.find('workflows')!
  if (hook && !(await mayIssueWebhook(input, session))) throw forbidden('access-denied', 'Issuing a webhook URL needs the right to change workflows: create it without publish')
  const created = await runWrite(input.deps(), entry, session, { operation: 'create', body: live.publish ? { ...body, enabled_version: 1 } : body })
  if (!hook) return created
  try {
    return { ...created, webhook: await issueWebhook(input, session, String(created.record.id), { ...(live.secret !== undefined && { secret: live.secret }), origin: live.origin }) }
  } catch (error) {
    if (!(error instanceof HttpProblem)) throw error
    return { ...created, webhookError: error.detail }
  }
}
