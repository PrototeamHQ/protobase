import type { AdminAuth } from '../better-auth/create-auth'
import type { Deps } from '../deps'
import { betterAuthOwnerRoles } from '../webhooks/table/owner-roles'
import { runInputCheck } from './input-limits'
import { secretRedactor } from '@protobase/workflows'
import { workflowSecrets, workflowsSchema, type WorkflowsOptions } from './options'
import { workflowSaveHook } from './save-hook'
import { workflowsRunner } from './segment-job'
import { runStartHook } from './start-hook'
import { hookRoute } from './hooks/hook-route'
import { issueRoute } from './hooks/issue-route'
import { workflowDeleteHook } from './triggers/delete-hook'
import { triggerJobs } from './triggers/trigger-jobs'
import { workflowTypes } from './workflow-types'

/**
 * What `createAdmin` needs for `workflows`: the hooks that check saves and start runs, the check of a run's input before
 * it is validated, the app's trigger and step types, the segment and trigger jobs, the routing of changes to
 * ready triggers, and the segment job, whose step
 * types act on records as each workflow's last editor (from Better Auth unless the options say otherwise).
 */
export const workflowEngine = (options: WorkflowsOptions, deps: () => Deps, auth?: AdminAuth) => {
  const schema = workflowsSchema(options)
  const roles = options.savedByRoles ?? (auth && betterAuthOwnerRoles(auth))
  if (!roles) throw new Error("workflows act on records as each workflow's last editor, with their current roles: give the config `auth` (Better Auth), or `workflows.savedByRoles`")
  const input = { deps, schema, roles, allowPrivateAddresses: Boolean(options.allowPrivateAddresses) }
  const secrets = workflowSecrets(options, globalThis.process?.env ?? {})
  const types = workflowTypes(options.plugins, (name) => deps().registry.find(name)?.model)
  const { runner, job } = workflowsRunner({ schema, tasks: (context) => types.tasks(input, context.mail), secrets })
  const redactor = secretRedactor(Object.values(secrets))
  // Only the types a save takes: a trigger of a type no longer available, as after an app update, does nothing.
  const usable = <T>(found: Map<string, T>) => (type: string) => (types.check.triggers[type] ? found.get(type) : undefined)
  const triggers = triggerJobs({
    ...input,
    declared: (type) => types.ready.get(type),
    readyTypes: [...types.ready.keys()].filter((id) => types.check.triggers[id] !== undefined),
    polling: usable(types.polling),
    webhooks: usable(types.webhooks),
    redact: redactor.text,
    origin: () => auth?.origins[0],
    systemPath: () => deps().systemPath,
  })
  const webhooks = usable(types.webhooks)
  const issue = { deps, schema, webhooks, origin: () => auth?.origins[0] }
  // The public webhook address, and where a caller who may change a workflow issues its URL.
  const routes = {
    hooks: () => hookRoute({ db: deps().db, schema, webhooks, webhookTypes: () => [...types.webhooks.keys()].filter((id) => webhooks(id)), files: () => deps().files, report: (error) => deps().report(error), redact: redactor.text }),
    issue: () => issueRoute(issue),
  }
  return { routes, issue, hooks: [workflowSaveHook(schema, types.check, triggers), workflowDeleteHook(schema, triggers), runStartHook(runner, deps, schema)], writeChecks: [runInputCheck], jobs: [job, ...triggers.jobs], onChanges: triggers.onChanges, types }
}
