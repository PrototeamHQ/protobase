/**
 * `enable_workflow` and `new_webhook_url`: turning a workflow's trigger on or off, and issuing its webhook URL, each as
 * the caller and after the user approves it in their client.
 */
import { approvalTexts, recordBefore } from '../../assistant/record-before'
import { refused } from '../../assistant/record-tool-args'
import { defineTool } from '../../assistant/tools'
import { recordName, updateApproval } from '../../assistant/write-prompts'
import { notApproved, onlyNote, outside, type WriteRecordToolsInput } from '../../assistant/write-tool-limits'
import { HttpProblem, notFound, preconditionFailed } from '../../problem'
import type { Session } from '../../types'
import { idOf, idParameter, textOf } from './workflow-tool-args'

const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }

/** Issues a workflow's webhook URL as the caller; the server answers 404 for a workflow they may not change. */
export type IssueWebhook = (session: Session, id: string, secret: string | undefined) => Promise<{ url: string; secret: string }>

// A version that signs in through someone's connected account is turned on by its owner, signed in as themselves: an
// outside app acting for them never can, so the tool says where they do it instead of passing on the refusal.
const enableRefused = (error: unknown) => {
  if (error instanceof HttpProblem && error.slug === 'own-sign-in-only') {
    return JSON.stringify({ error: 'own-sign-in-only', message: "This workflow signs in through a connected account, so it was not turned on: the account's owner turns it on in the admin app, on the workflow's page, signed in as themselves. Saving it stays open to you." })
  }
  return refused(error)
}

/** Turns a workflow's trigger on, on its current version, or off, once the user approves it. */
export const enableWorkflowTool = (input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'enable_workflow',
    description: `Turns a workflow's trigger on (enabled: true) on version, which must be its current version as create_workflow, update_workflow or get_workflow gave it, or off (enabled: false), and returns JSON { id, enabled_version }. A workflow saved since that version is refused; read it again. While on, its trigger starts runs: a webhook trigger whose sender you give a URL once it is issued with new_webhook_url, one that registers its own URL with its service as soon as it did, a polling trigger at its next poll. A later save keeps it on, on the new version. A workflow that signs in through a connected account (its connections) is turned on only by that account's owner in the admin app: here it is refused with error own-sign-in-only. The user approves it in their client first.${onlyNote(input)}`,
    parameters: {
      type: 'object',
      properties: {
        id: idParameter,
        enabled: { type: 'boolean', description: 'true to turn it on, false to turn it off.' },
        version: { type: 'integer', description: "With enabled: true, the version to turn on: the workflow's current version." },
      },
      required: ['id', 'enabled'],
    },
    annotations: writes,
    run: async (args, context) => {
      const id = idOf(args)
      const version = args.version
      if (!id || typeof args.enabled !== 'boolean' || (args.enabled && !Number.isInteger(version))) return 'Pass { "id": "<id>", "enabled": true, "version": <its current version> } or { "id": "<id>", "enabled": false }.'
      const refusal = outside(input, 'workflows')
      if (refusal) return refusal
      const before = await recordBefore(context, 'workflows', id, undefined)
      if (typeof before === 'string') return before
      if (!before) return refused(notFound('No workflows with this key that you may read'))
      // The version is one of the arguments the approval is bound to, so a save while it waits cannot turn on another.
      if (args.enabled && before.record.version !== version) return refused(preconditionFailed(`The workflow was saved since version ${version}; its current version is ${before.record.version}`))
      const data = { enabled_version: args.enabled ? version : null }
      const { text, described } = await approvalTexts(context, 'workflows')
      const answer = await context.approve(updateApproval(text, described, id, before.record, data))
      if (answer !== 'approved') return notApproved(answer)
      // Turned on with the etag the version was read with, so a save since then fails rather than leave an older version on.
      return context.records.update('workflows', id, data, args.enabled ? { etag: before.etag } : {}).then(({ record }) => JSON.stringify({ id: record.id, enabled_version: record.enabled_version }), enableRefused)
    },
  })

/** Issues a new webhook URL and secret for a workflow, once the user approves it. */
export const newWebhookUrlTool = (issue: IssueWebhook, input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'new_webhook_url',
    description: `Issues a new URL and secret for a workflow that starts from a webhook trigger whose sender you give a URL (such as app:webhook), and returns JSON { url, secret }, shown this once: the app keeps no way to show them again, and the workflow's old URL stops. Pass secret to keep one the sender makes itself (a Standard Webhooks sender's whsec_ secret); without it the app makes one. The sender then POSTs to the url, signed as the trigger's auth mode says. A trigger that registers its own URL with its service is refused: turning the workflow on is all it needs. The user approves it in their client first.${onlyNote(input)}`,
    parameters: { type: 'object', properties: { id: idParameter, secret: { type: 'string', description: "The sender's own secret, when it makes one; omit it to have the app make one." } }, required: ['id'] },
    annotations: writes,
    run: async (args, context) => {
      const id = idOf(args)
      if (!id) return 'Pass { "id": "<id>" }, and a secret when the sender makes its own.'
      const refusal = outside(input, 'workflows')
      if (refusal) return refusal
      const before = await recordBefore(context, 'workflows', id, undefined)
      if (typeof before === 'string') return before
      if (!before) return refused(notFound('No workflows with this key that you may read'))
      const { text, described } = await approvalTexts(context, 'workflows')
      const answer = await context.approve({ title: text('webhookTitle', { record: recordName(described, id, before.record) }), body: text('webhookBody'), approveLabel: text('issue'), rejectLabel: text('reject') })
      if (answer !== 'approved') return notApproved(answer)
      return issue(context.session, id, textOf(args.secret) || undefined).then((issued) => JSON.stringify(issued), refused)
    },
  })

/** The tools that turn workflows on and issue their webhook URLs; `new_webhook_url` only where the app can issue them. */
export const webhookTools = (input: WriteRecordToolsInput = {}, issue?: IssueWebhook) => [enableWorkflowTool(input), ...(issue ? [newWebhookUrlTool(issue, input)] : [])]
