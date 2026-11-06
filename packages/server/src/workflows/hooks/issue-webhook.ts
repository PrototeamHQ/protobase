import type { Db } from '@protobase/query'
import type { WebhookTrigger } from '@protobase/workflows/plugin'
import type { Deps } from '../../deps'
import { fetchReadable } from '../../fetch-readable'
import { deletedRows } from '../../params'
import { badRequest, notFound } from '../../problem'
import { requestAccess } from '../../request-access'
import type { Session } from '../../types'
import { mayUpdateWorkflow } from '../may-update-workflow'
import { hookPath } from './hook-paths'
import { hookMode } from './hook-secrets'
import { saveHook } from './hook-store'

export type IssueInput = { deps: () => Deps; schema: string; webhooks: (type: string) => WebhookTrigger | undefined; origin: () => string | undefined }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const missing = () => notFound('No workflows with this key that you may change')

/**
 * Gives a workflow a new webhook URL and secret, as `POST .../workflows/<id>/webhook` and `new_webhook_url` do: only for
 * a caller who may change that workflow in their tenant, as its update access decides; 404 for anyone else, as for a
 * workflow that is not there. Its current definition must start from a webhook trigger that does not register its own
 * URL. The secret is the caller's, checked for the trigger's mode, or a new one. Both come back once; the old URL stops.
 */
export const issueWebhook = async ({ deps, schema, webhooks, origin }: IssueInput, session: Session, id: string, request: { secret?: string; origin: string }) => {
  if (!uuid.test(id)) throw missing()
  const entry = deps().registry.find('workflows')!
  const access = await requestAccess(deps(), entry, session)
  if (!access.resolved.operations.update) throw missing()
  return deps().db.transaction().execute(async (trx) => {
    const found = await fetchReadable(trx, access, [id], deletedRows(access.full, false), { lock: true })
    if (!found || !(await mayUpdateWorkflow(trx, access, id, found.record))) throw missing()
    const record = found.record
    const [type, input] = Object.entries((record.definition as { trigger: Record<string, Record<string, unknown>> }).trigger)[0]!
    const trigger = webhooks(type)
    if (!trigger) throw badRequest('not-a-webhook', 'This workflow does not start from a webhook trigger, such as app:webhook')
    if (trigger.subscribe) throw badRequest('not-a-webhook', `${type} registers its own URL with its service as the workflow is turned on`)
    const mode = hookMode(input)
    if (!mode) throw badRequest('invalid-workflow', 'The webhook trigger names an auth mode this app does not know')
    const { key, secret } = await saveHook(trx, schema, { workflow: id, tenant: (record.tenant_id as string | null) ?? null, mode, ...(request.secret !== undefined && { secret: request.secret }) })
    return { url: `${origin() ?? request.origin}${hookPath(deps().systemPath, key)}`, secret }
  })
}
