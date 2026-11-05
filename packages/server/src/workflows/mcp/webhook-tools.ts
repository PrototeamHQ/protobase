/**
 * `enable_workflow` and `new_webhook_url`: turning a workflow's trigger on or off, and issuing its webhook URL, each as
 * the caller and after the user approves it in their client.
 */
import { approvalTexts, recordBefore } from '../../assistant/record-before'
import { refused } from '../../assistant/record-tool-args'
import { defineTool } from '../../assistant/tools'
import { recordName, updateApproval } from '../../assistant/write-prompts'
import { notApproved, onlyNote, outside, type WriteRecordToolsInput } from '../../assistant/write-tool-limits'
import { notFound } from '../../problem'
import type { Session } from '../../types'
import { idOf, idParameter, textOf } from './workflow-tool-args'

const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }

/** Issues a workflow's webhook URL as the caller; the server answers 404 for a workflow they may not change. */
export type IssueWebhook = (session: Session, id: string, secret: string | undefined) => Promise<{ url: string; secret: string }>

/** Turns a workflow's trigger on, on its current version, or off, once the user approves it. */
export const enableWorkflowTool = (input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'enable_workflow',
    description: `Turns a workflow's trigger on (enabled: true), on its current version, or off (enabled: false), and returns JSON { id, enabled_version }. While on, its trigger starts runs: a webhook trigger once its URL is issued with new_webhook_url, a polling trigger at its next poll. A later save keeps it on, on the new version. The user approves it in their client first.${onlyNote(input)}`,
    parameters: { type: 'object', properties: { id: idParameter, enabled: { type: 'boolean', description: 'true to turn it on, false to turn it off.' } }, required: ['id', 'enabled'] },
    annotations: writes,
    run: async (args, context) => {
      const id = idOf(args)
      if (!id || typeof args.enabled !== 'boolean') return 'Pass { "id": "<id>", "enabled": true } or false.'
      const refusal = outside(input, 'workflows')
      if (refusal) return refusal
      const before = await recordBefore(context, 'workflows', id, undefined)
      if (typeof before === 'string') return before
      if (!before) return refused(notFound('No workflows with this key that you may read'))
      const data = { enabled_version: args.enabled ? before.record.version : null }
      const { text, described } = await approvalTexts(context, 'workflows')
      const answer = await context.approve(updateApproval(text, described, id, before.record, data))
      if (answer !== 'approved') return notApproved(answer)
      return context.records.update('workflows', id, data).then(({ record }) => JSON.stringify({ id: record.id, enabled_version: record.enabled_version }), refused)
    },
  })

/** Issues a new webhook URL and secret for a workflow, once the user approves it. */
export const newWebhookUrlTool = (issue: IssueWebhook, input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'new_webhook_url',
    description: `Issues a new URL and secret for a workflow that starts from a webhook trigger (such as app:webhook), and returns JSON { url, secret }, shown this once: the app keeps no way to show them again, and the workflow's old URL stops. Pass secret to keep one the sender makes itself (a Standard Webhooks sender's whsec_ secret); without it the app makes one. The sender then POSTs to the url, signed as the trigger's auth mode says. The user approves it in their client first.${onlyNote(input)}`,
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
