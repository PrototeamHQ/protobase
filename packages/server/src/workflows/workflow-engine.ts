import type { AdminAuth } from '../better-auth/create-auth'
import type { Deps } from '../deps'
import { betterAuthOwnerRoles } from '../webhooks/table/owner-roles'
import { runInputCheck } from './input-limits'
import { workflowSecrets, workflowsSchema, type WorkflowsOptions } from './options'
import { workflowSaveHook } from './save-hook'
import { workflowsRunner } from './segment-job'
import { runStartHook } from './start-hook'
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
  const triggers = triggerJobs({ deps, schema, roles, declared: (type) => types.ready.get(type), readyTypes: [...types.ready.keys()].filter((id) => types.check.triggers[id] !== undefined) })
  return { hooks: [workflowSaveHook(schema, types.check, triggers), runStartHook(runner, deps, schema)], writeChecks: [runInputCheck], jobs: [job, ...triggers.jobs], onChanges: triggers.onChanges, types }
}
