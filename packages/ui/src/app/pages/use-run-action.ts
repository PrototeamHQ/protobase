import { useState } from 'react'
import { ApiError } from '@protobase/client'
import type { ActionModel } from '@protobase/schema'
import { fillAddress, updateValues } from '@protobase/schema/internal'
import { useClient, useResourceClient } from '../../data/api-provider'
import { useMailboxToastAction } from '../../mailbox/use-mailbox-toast-action'
import { useToast } from '../../toasts'
import { useAdminMeta, usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { useAppAddress } from '../use-app-address'
import { actionFor, linkTarget, openLink } from './action-href'
import { actionApplies } from './action-when'
import { useProjectUi } from './project-ui'
import type { LayoutRecord } from './record-scope'
import { runEach, type EachVerdict } from './run-each'
import { answersFor } from './action-inputs/checklist-boxes'
import { useRecordTitle } from '../titles/record-titles'
import { useRefreshResource } from './use-layout-data'
import { text } from './messages'

/** A record's title, quoted, to name it inside a sentence. */
export const quoted = (title: string) => `“${title}”`

const message = (error: unknown) => (error instanceof Error ? error.message : text('somethingWrong'))

/**
 * The named actions of `resource`'s view, ready to run on `scope` (the record they act on): built-in behaviour first
 * (`update`, `delete`, `link`, and `ai`, which the server runs), else the handler the project registered under the
 * action's name. One whose `when` does not hold for the record is left out, or blocked with its `reason`; an update
 * whose values the record holds already is left out, and so is a link to a URL the record holds while it holds none.
 * `blocked` says why one cannot run; `afterRun` hears about every action that succeeded.
 * `submit` runs one with the answers to its inputs (a handler gets them, an update writes them) and throws its failure, for the dialog to show.
 * `runEach` runs one on each of several records it applies to, as a list's selection does, with the answers to its inputs
 * as each record gets them, and says how that went, naming the records the person may not change.
 */
export const useActionRunner = (resource: string, scope: LayoutRecord | undefined, afterRun?: (action: ActionModel) => void) => {
  const { views, resources } = useAdminMeta()
  const { actions: handlers, components } = useProjectUi()
  const permissions = usePermissions(resource)
  const client = useClient()
  // A handler works on the API that serves the resource, functions included: a source's for one drawn from it.
  const handlerClient = useResourceClient(resource)
  const toast = useToast()
  const mailboxAction = useMailboxToastAction()
  const refresh = useRefreshResource()
  const { go } = useAppAddress()
  const titleOf = useRecordTitle()
  const [running, setRunning] = useState<string>()
  // An update shows only while it would change the record, a link to a URL the record holds only while it holds one, its label naming the URL's host
  const actions = (views[resource]?.actions ?? []).flatMap((action) => actionFor(action, scope?.record, resources) ?? [])

  // Why `action` cannot run on `on`, the record it would act on.
  const blockedOn = (action: ActionModel, on: LayoutRecord | undefined) => {
    const kind = action.run?.kind
    if ((kind === 'update' || kind === 'delete' || kind === 'ai') && !on) return text('needsRecord')
    if (!actionApplies(action, on?.record)) return action.reason ?? text('doesNotApply')
    if ((kind === 'update' || kind === 'ai') && (!can(permissions, 'update') || on?.permissions?.update === false)) return text('cannotChange')
    if (action.run?.kind === 'ai' && on?.permissions?.fields?.[action.run.writes] === 'read') return text('cannotChange')
    if (kind === 'delete' && (!can(permissions, 'delete') || on?.permissions?.delete === false)) return text('cannotDelete')
    if (!action.run && !handlers?.[action.name]) return text('noHandler', { name: action.name })
    const custom = action.inputs?.find((input) => input.kind === 'custom' && !components?.[input.component ?? ''])
    if (custom) return text('noInputComponent', { component: String(custom.component), input: custom.name })
    return undefined
  }
  const blocked = (action: ActionModel) => blockedOn(action, scope)

  // Whether the person may change this record, though they may change others of the resource: its own permissions say no.
  const refusedOn = (action: ActionModel, on: LayoutRecord) => {
    const { run } = action
    const kind = run?.kind
    if (kind === 'update' || kind === 'ai') return can(permissions, 'update') && (on.permissions?.update === false || (run?.kind === 'ai' && on.permissions?.fields?.[run.writes] === 'read'))
    if (kind === 'delete') return can(permissions, 'delete') && on.permissions?.delete === false
    return false
  }

  // Runs the action on `on`, without telling the user how it went.
  const execute = async (action: ActionModel, on: LayoutRecord | undefined, values?: Record<string, unknown>) => {
    const { run } = action
    if (run?.kind === 'link') {
      if ('to' in run) go(fillAddress(run.to, on?.record))
      else openLink(linkTarget(run.href, on?.record))
      return
    }
    if (run?.kind === 'update') await client.update(resource, on!.key, updateValues(run.values as Record<string, unknown>, values ?? {}), on!.etag ?? '*')
    else if (run?.kind === 'delete') await client.remove(resource, on!.key, { etag: on!.etag })
    else if (run?.kind === 'ai') await client.generate(resource, on!.key, action.name)
    else await handlers![action.name]!({ resource, record: on?.record, recordKey: on?.key, etag: on?.etag, client: handlerClient, navigate: go, ...(values && { values }) })
  }

  const perform = async (action: ActionModel, on: LayoutRecord | undefined, values?: Record<string, unknown>) => {
    await execute(action, on, values)
    if (action.run?.kind === 'link') return
    await refresh(resource)
    toast.show({ state: 'success', title: text('done', { label: action.label }) })
    afterRun?.(action)
  }

  // `on` is another record than the scope's, such as a list's row. A failure for want of a mailbox offers to connect one.
  const run = async (action: ActionModel, on = scope) => {
    if (blockedOn(action, on)) return
    setRunning(action.name)
    await perform(action, on).catch((error: unknown) => {
      const connect = mailboxAction(error)
      toast.show({ state: 'error', title: text('failed', { label: action.label }), description: message(error), ...(connect && { action: connect }) })
    })
    setRunning(undefined)
  }

  // An action with inputs runs from its dialog, which shows a failure under the inputs it is about instead of a toast.
  const submit = async (action: ActionModel, values: Record<string, unknown>) => {
    if (blocked(action)) return
    setRunning(action.name)
    await perform(action, scope, answersFor(action.inputs ?? [], values, scope?.record)).finally(() => setRunning(undefined))
  }

  /** Whether `action` shows and can run on `on`. */
  const appliesOn = (action: ActionModel, on: LayoutRecord) => actionFor(action, on.record, resources) !== undefined && !blockedOn(action, on)

  /** What a run over several records does with `on`: runs on it, refuses it as one the person may not change, or skips it. */
  const verdictOn = (action: ActionModel, on: LayoutRecord): EachVerdict => {
    if (appliesOn(action, on)) return 'run'
    const shows = actionFor(action, on.record, resources) !== undefined && actionApplies(action, on.record)
    return shows && refusedOn(action, on) ? 'refuse' : 'skip'
  }

  // A failure on one record leaves the others to run; the toast counts them, with the first failure's message, and
  // the records the caller left out already as not applying (`skipped`), and names those the person may not change,
  // refused here or by the API.
  const runOnEach = async (action: ActionModel, records: LayoutRecord[], skipped = 0, values?: Record<string, unknown>) => {
    setRunning(action.name)
    const answers = (on: LayoutRecord) => (values ? answersFor(action.inputs ?? [], values, on.record) : undefined)
    const refusal = (error: unknown) => error instanceof ApiError && error.status === 403
    const outcome = await runEach(records, (on) => verdictOn(action, on), (on) => execute(action, on, answers(on)), refusal)
    setRunning(undefined)
    await refresh(resource)
    const refused = outcome.refused.map((on) => quoted(titleOf(on.model, views[resource], on.record, on.key)))
    const title = text('doneOn', { label: action.label, done: outcome.done, skipped: outcome.skipped + skipped, failed: outcome.failed, refused: refused.length })
    const description = [refused.length > 0 && text('refusedOn', { records: refused.join(', '), count: refused.length }), outcome.failed > 0 && message(outcome.error)].filter(Boolean).join(' ')
    toast.show({ state: outcome.failed > 0 || refused.length > 0 ? 'error' : 'success', title, ...(description && { description }) })
    if (outcome.done > 0) afterRun?.(action)
  }

  return { actions, blocked, blockedOn, appliesOn, verdictOn, running, run, submit, runEach: runOnEach }
}

/** One named action of `resource`'s view, for a button; `afterRun` hears when it succeeded. */
export const useRunAction = (resource: string, name: string, scope: LayoutRecord | undefined, afterRun?: (action: ActionModel) => void) => {
  const runner = useActionRunner(resource, scope, afterRun)
  const action = runner.actions.find((entry) => entry.name === name)
  return {
    action,
    /** The record it acts on, when it acts on one. */
    record: scope?.record,
    blocked: action ? runner.blocked(action) : text('noAction', { name }),
    running: runner.running === name,
    run: () => (action ? runner.run(action) : Promise.resolve()),
    submit: (values: Record<string, unknown>) => (action ? runner.submit(action, values) : Promise.resolve()),
  }
}
