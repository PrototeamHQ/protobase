import type { AdminAuth } from '../better-auth/create-auth'
import type { Deps } from '../deps'
import { betterAuthOwnerRoles } from '../webhooks/table/owner-roles'
import { runInputCheck } from './input-limits'
import { workflowSecrets, workflowsSchema, type WorkflowsOptions } from './options'
import { workflowSaveHook } from './save-hook'
import { workflowsRunner } from './segment-job'
import { runStartHook } from './start-hook'
import { stepTypeNames, stepTypes } from './step-types'

/**
 * What `createAdmin` needs for `workflows`: the hooks that check saves and start runs, the check of a run's input before
 * it is validated, and the segment job, whose step
 * types act on records as each workflow's last editor (from Better Auth unless the options say otherwise).
 */
export const workflowEngine = (options: WorkflowsOptions, deps: () => Deps, auth?: AdminAuth) => {
  const schema = workflowsSchema(options)
  const roles = options.savedByRoles ?? (auth && betterAuthOwnerRoles(auth))
  if (!roles) throw new Error("workflows act on records as each workflow's last editor, with their current roles: give the config `auth` (Better Auth), or `workflows.savedByRoles`")
  const input = { deps, schema, roles, allowPrivateAddresses: Boolean(options.allowPrivateAddresses) }
  const secrets = workflowSecrets(options, globalThis.process?.env ?? {})
  const { runner, job } = workflowsRunner({ schema, tasks: (context) => stepTypes(input, context.mail), secrets })
  return { hooks: [workflowSaveHook(schema, stepTypeNames), runStartHook(schema, runner, deps)], writeChecks: [runInputCheck], job }
}
