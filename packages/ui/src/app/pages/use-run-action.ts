import { useState } from 'react'
import type { ActionModel } from '@protobase/schema'
import { fillAddress } from '@protobase/schema/internal'
import { useClient, useResourceClient } from '../../data/api-provider'
import { useToast } from '../../toasts'
import { useAdminMeta, usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { useAppAddress } from '../use-app-address'
import { actionFor, linkTarget, openLink } from './action-href'
import { useProjectUi } from './project-ui'
import type { LayoutRecord } from './record-scope'
import { useRefreshResource } from './use-layout-data'

const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

/**
 * The named actions of `resource`'s view, ready to run on `scope` (the record they act on): built-in behaviour first
 * (`update`, `delete`, `link`, and `ai`, which the server runs), else the handler the project registered under the
 * action's name. An update whose values the record holds already is left out, and so is a link to a URL the record
 * holds while it holds none. `blocked` says why one cannot run; `afterRun` hears about every action that succeeded.
 * `submit` runs one with the answers to its inputs and throws its failure, for the dialog to show.
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

  const blocked = (action: ActionModel) => {
    const kind = action.run?.kind
    if ((kind === 'update' || kind === 'delete' || kind === 'ai') && !scope) return 'Needs a record'
    if ((kind === 'update' || kind === 'ai') && (!can(permissions, 'update') || scope?.permissions?.update === false)) return 'You cannot change this record'
    if (action.run?.kind === 'ai' && scope?.permissions?.fields?.[action.run.writes] === 'read') return 'You cannot change this record'
    if (kind === 'delete' && (!can(permissions, 'delete') || scope?.permissions?.delete === false)) return 'You cannot delete this record'
    if (!action.run && !handlers?.[action.name]) return `The app has no handler for "${action.name}"`
    const custom = action.inputs?.find((input) => input.kind === 'custom' && !components?.[input.component ?? ''])
    if (custom) return `The app has no component "${custom.component}" for input "${custom.name}"`
    return undefined
  }

  const perform = async (action: ActionModel, values?: Record<string, unknown>) => {
    const { run } = action
    if (run?.kind === 'link') {
      if ('to' in run) go(fillAddress(run.to, scope?.record))
      else openLink(linkTarget(run.href, scope?.record))
      return
    }
    if (run?.kind === 'update') await client.update(resource, scope!.key, run.values as Record<string, unknown>, scope!.etag ?? '*')
    else if (run?.kind === 'delete') await client.remove(resource, scope!.key, { etag: scope!.etag })
    else if (run?.kind === 'ai') await client.generate(resource, scope!.key, action.name)
    else await handlers![action.name]!({ resource, record: scope?.record, recordKey: scope?.key, etag: scope?.etag, client: handlerClient, navigate: go, ...(values && { values }) })
    await refresh(resource)
    toast.show({ state: 'success', title: `${action.label}: done` })
    afterRun?.(action)
  }

  const run = async (action: ActionModel) => {
    if (blocked(action)) return
    setRunning(action.name)
    await perform(action).catch((error: unknown) => toast.show({ state: 'error', title: `${action.label} failed`, description: message(error) }))
    setRunning(undefined)
  }

  // An action with inputs runs from its dialog, which shows a failure under the inputs it is about instead of a toast.
  const submit = async (action: ActionModel, values: Record<string, unknown>) => {
    if (blocked(action)) return
    setRunning(action.name)
    await perform(action, values).finally(() => setRunning(undefined))
  }

  return { actions, blocked, running, run, submit }
}

/** One named action of `resource`'s view, for a button. */
export const useRunAction = (resource: string, name: string, scope: LayoutRecord | undefined) => {
  const runner = useActionRunner(resource, scope)
  const action = runner.actions.find((entry) => entry.name === name)
  return {
    action,
    blocked: action ? runner.blocked(action) : `No action "${name}"`,
    running: runner.running === name,
    run: () => (action ? runner.run(action) : Promise.resolve()),
    submit: (values: Record<string, unknown>) => (action ? runner.submit(action, values) : Promise.resolve()),
  }
}
