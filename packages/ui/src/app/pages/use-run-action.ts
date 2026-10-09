import { useState } from 'react'
import type { ActionModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { useToast } from '../../toasts'
import { useAdminMeta, usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { useRouter } from '../router'
import { fillHref, isAppPath } from './action-href'
import { useProjectUi } from './project-ui'
import type { LayoutRecord } from './record-scope'
import { useRefreshResource } from './use-layout-data'

const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

/**
 * The named actions of `resource`'s view, ready to run on `scope` (the record they act on): built-in behaviour first
 * (`update`, `delete`, `link`), else the handler the project registered under the action's name. `blocked` says why one
 * cannot run; `afterRun` hears about every action that succeeded.
 */
export const useActionRunner = (resource: string, scope: LayoutRecord | undefined, afterRun?: (action: ActionModel) => void) => {
  const { views } = useAdminMeta()
  const { actions: handlers } = useProjectUi()
  const permissions = usePermissions(resource)
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const { navigate } = useRouter()
  const [running, setRunning] = useState<string>()
  const actions = views[resource]?.actions ?? []

  const blocked = (action: ActionModel) => {
    const kind = action.run?.kind
    if ((kind === 'update' || kind === 'delete') && !scope) return 'Needs a record'
    if (kind === 'update' && (!can(permissions, 'update') || scope?.permissions?.update === false)) return 'You cannot change this record'
    if (kind === 'delete' && (!can(permissions, 'delete') || scope?.permissions?.delete === false)) return 'You cannot delete this record'
    if (!action.run && !handlers?.[action.name]) return `The app has no handler for "${action.name}"`
    return undefined
  }

  const perform = async (action: ActionModel) => {
    const { run } = action
    if (run?.kind === 'link') {
      const href = fillHref(run.href, scope?.record)
      if (isAppPath(href)) navigate(href)
      else window.location.assign(href)
      return
    }
    if (run?.kind === 'update') await client.update(resource, scope!.key, run.values as Record<string, unknown>, scope!.etag ?? '*')
    else if (run?.kind === 'delete') await client.remove(resource, scope!.key, { etag: scope!.etag })
    else await handlers![action.name]!({ resource, record: scope?.record, recordKey: scope?.key, etag: scope?.etag, client, navigate })
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

  return { actions, blocked, running, run }
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
  }
}
