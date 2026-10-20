import { useState } from 'react'
import type { ActionModel } from '@protobase/schema'
import { fillAddress, updateValues } from '@protobase/schema/internal'
import { useClient, useResourceClient } from '../../data/api-provider'
import { useToast } from '../../toasts'
import { useAdminMeta, usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { useAppAddress } from '../use-app-address'
import { actionFor, linkTarget, openLink } from './action-href'
import { actionApplies } from './action-when'
import { useProjectUi } from './project-ui'
import type { LayoutRecord } from './record-scope'
import { runEach } from './run-each'
import { useRefreshResource } from './use-layout-data'
import { text } from './messages'

const message = (error: unknown) => (error instanceof Error ? error.message : text('somethingWrong'))

/**
 * The named actions of `resource`'s view, ready to run on `scope` (the record they act on): built-in behaviour first
 * (`update`, `delete`, `link`, and `ai`, which the server runs), else the handler the project registered under the
 * action's name. One whose `when` does not hold for the record is left out, or blocked with its `reason`; an update
 * whose values the record holds already is left out, and so is a link to a URL the record holds while it holds none.
 * `blocked` says why one cannot run; `afterRun` hears about every action that succeeded.
 * `submit` runs one with the answers to its inputs (a handler gets them, an update writes them) and throws its failure, for the dialog to show.
 * `runEach` runs one on each of several records it applies to, as a list's selection does, and says how that went.
 */
export const useActionRunner = (resource: string, scope: LayoutRecord | undefined, afterRun?: (action: ActionModel) => void) => {
  const { views } = useAdminMeta()
  const { actions: handlers, components } = useProjectUi()
  const permissions = usePermissions(resource)
  const client = useClient()
  // A handler works on the API that serves the resource, functions included: a source's for one drawn from it.
  const handlerClient = useResourceClient(resource)
  const toast = useToast()
  const refresh = useRefreshResource()
  const { go } = useAppAddress()
  const [running, setRunning] = useState<string>()
  // An update shows only while it would change the record, a link to a URL the record holds only while it holds one, its label naming the URL's host
  const actions = (views[resource]?.actions ?? []).flatMap((action) => actionFor(action, scope?.record) ?? [])

  // Why `action` cannot run on `on`, the record it would act on.
  const blockedOn = (action: ActionModel, on: LayoutRecord | undefined) => {
    const kind = action.run?.kind
    if ((kind === 'update' || kind === 'delete' || kind === 'ai') && !on) return text('needsRecord')
    if (!actionApplies(action, on?.record)) return action.reason ?? text('doesNotApply')
    if ((kind === 'update' || kind === 'ai') && (!can(permissions, 'update') || on?.permissions?.update === false)) return text('cannotChange')
    if (action.run?.kind === 'ai' && on?.permissions?.fields?.[action.run.writes] === 'read') return text('cannotChange')
    if (kind === 'delete' && (!can(permissions, 'delete') || on?.permissions?.delete === false)) return text('cannotDelete')
    if (!action.run && !handlers?.[action.name]) return text('noHandler', action.name)
    const custom = action.inputs?.find((input) => input.kind === 'custom' && !components?.[input.component ?? ''])
    if (custom) return text('noInputComponent', String(custom.component), custom.name)
    return undefined
  }
  const blocked = (action: ActionModel) => blockedOn(action, scope)

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
    toast.show({ state: 'success', title: text('done', action.label) })
    afterRun?.(action)
  }

  // `on` is another record than the scope's, such as a list's row.
  const run = async (action: ActionModel, on = scope) => {
    if (blockedOn(action, on)) return
    setRunning(action.name)
    await perform(action, on).catch((error: unknown) => toast.show({ state: 'error', title: text('failed', action.label), description: message(error) }))
    setRunning(undefined)
  }

  // An action with inputs runs from its dialog, which shows a failure under the inputs it is about instead of a toast.
  const submit = async (action: ActionModel, values: Record<string, unknown>) => {
    if (blocked(action)) return
    setRunning(action.name)
    await perform(action, scope, values).finally(() => setRunning(undefined))
  }

  /** Whether `action` shows and can run on `on`. */
  const appliesOn = (action: ActionModel, on: LayoutRecord) => actionFor(action, on.record) !== undefined && !blockedOn(action, on)

  // A failure on one record leaves the others to run; the toast counts them, with the first failure's message.
  const runOnEach = async (action: ActionModel, records: LayoutRecord[]) => {
    setRunning(action.name)
    const outcome = await runEach(records, (on) => appliesOn(action, on), (on) => execute(action, on))
    setRunning(undefined)
    await refresh(resource)
    const title = text('doneOn', action.label, outcome.done, outcome.skipped, outcome.failed)
    toast.show(outcome.failed > 0 ? { state: 'error', title, description: message(outcome.error) } : { state: 'success', title })
    if (outcome.done > 0) afterRun?.(action)
  }

  return { actions, blocked, blockedOn, appliesOn, running, run, submit, runEach: runOnEach }
}

/** One named action of `resource`'s view, for a button. */
export const useRunAction = (resource: string, name: string, scope: LayoutRecord | undefined) => {
  const runner = useActionRunner(resource, scope)
  const action = runner.actions.find((entry) => entry.name === name)
  return {
    action,
    blocked: action ? runner.blocked(action) : text('noAction', name),
    running: runner.running === name,
    run: () => (action ? runner.run(action) : Promise.resolve()),
    submit: (values: Record<string, unknown>) => (action ? runner.submit(action, values) : Promise.resolve()),
  }
}
