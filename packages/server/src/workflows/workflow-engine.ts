import { sql } from 'kysely'
import type { AdminAuth } from '../better-auth/create-auth'
import type { Deps } from '../deps'
import { betterAuthOwnerRoles } from '../webhooks/table/owner-roles'
import { runInputCheck } from './input-limits'
import { secretRedactor } from '@protobase/workflows'
import { workflowSecrets, workflowsSchema, workflowsStorage, workflowsTraceMode, type WorkflowsOptions } from './options'
import { storageConfigurationHook, storageEndpointCheck } from './storage/configuration-hook'
import { readTrace, traceSink } from './trace-sink'
import { workflowSaveHook } from './save-hook'
import { workflowsRunner } from './segment-job'
import { postgresStepCache } from './cache/step-cache-store'
import { secretFingerprints } from './cache/secret-fingerprints'
import { runStartHook } from './start-hook'
import { hookRoute } from './hooks/hook-route'
import { issueRoute } from './hooks/issue-route'
import { workflowDeleteHook } from './triggers/delete-hook'
import { triggerJobs } from './triggers/trigger-jobs'
import { workflowTypes } from './workflow-types'
import { betterAuthConnectionAccounts } from './connections/connection-accounts'
import { connectionWiring } from './connections/connection-wiring'
import { connectionUses } from './connections/connection-uses'
import { connectionTriggers } from './connections/connection-triggers'
import { connectionRevocations } from './connections/connection-revocations'
import { connectionRelease } from './connections/connection-release'
import type { TokenAuth } from '../personal-mail/linked-accounts'
import type { Locale } from '@protobase/schema/internal'
import { connectionTexts } from './connections/connection-texts'
import { traceJoining } from './trace-joining'

/**
 * What `createAdmin` needs for `workflows`: the hooks that check saves and start runs, the check of a run's input before
 * it is validated, the app's trigger and step types, the segment and trigger jobs, the routing of changes to
 * ready triggers, and the segment job, whose step types act on records as each workflow's last editor (from Better
 * Auth unless the options say otherwise), and which keeps runs' traces in the private file provider.
 */
export const workflowEngine = (options: WorkflowsOptions, deps: () => Deps, auth?: AdminAuth, locale?: Locale) => {
  const schema = workflowsSchema(options)
  const roles = options.savedByRoles ?? (auth && betterAuthOwnerRoles(auth))
  if (!roles) throw new Error("workflows act on records as each workflow's last editor, with their current roles: give the config `auth` (Better Auth), or `workflows.savedByRoles`")
  const env = globalThis.process?.env ?? {}
  const secrets = workflowSecrets(options, env)
  const types = workflowTypes(options.plugins, (name) => deps().registry.find(name)?.model, auth?.connectionSupport)
  const accounts = auth && betterAuthConnectionAccounts(auth as unknown as TokenAuth)
  const text = connectionTexts(locale)
  const connections = connectionWiring({ deps, schema, roles, accounts, plugins: types.plugins, connectionOf: types.connections, text, ...(auth && auth.personalMail.length > 0 && { personalMailer: auth.personalMailer }) })
  const storage = workflowsStorage(options)
  const allowPrivateAddresses = Boolean(options.allowPrivateAddresses)
  const input = { deps, schema, roles, allowPrivateAddresses, storage, connect: connections.trigger }
  const cache = postgresStepCache(() => deps().db, schema, secretFingerprints(secrets, env.PROTOBASE_SECRET))
  const files = () => deps().files
  const trace = traceSink({ files, joining: traceJoining(() => deps().db, schema), report: (error) => deps().report(error) })
  const { runner, job } = workflowsRunner({ schema, tasks: (context) => types.tasks(input, context.mail, connections.step, connections.mailbox), secrets, cache, trace, traceMode: workflowsTraceMode(options) })
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
  }, text, { webhooks: (type) => types.webhooks.get(type), connect: connections.stopping })
  // Linking an account again resumes its triggers; disconnecting it stops them, and queues a revocation the provider did not take.
  // The account page lists what uses each one.
  const revocations = auth && auth.connections.declared.length > 0 ? connectionRevocations(schema, auth.connections.revokeSealed) : undefined
  auth?.connections.events.set({
    ...connectionTriggers(() => deps().db, schema, triggers, text),
    uses: connectionUses({ deps, schema, roles }),
    ...connectionRelease({ db: () => deps().db, revocations, report: (error) => deps().report(error) }),
  })
  const webhooks = usable(types.webhooks)
  const issue = { deps, schema, webhooks, origin: () => auth?.origins[0] }
  // The public webhook address, and where a caller who may change a workflow issues its URL.
  const routes = {
    hooks: () => hookRoute({ db: deps().db, schema, webhooks, webhookTypes: () => [...types.webhooks.keys()].filter((id) => webhooks(id)), files: () => deps().files, report: (error) => deps().report(error), redact: redactor.text }),
    issue: () => issueRoute(issue),
  }
  return { routes, issue, hooks: [workflowSaveHook(schema, types.check, triggers, connections.consent), workflowDeleteHook(schema, triggers), runStartHook(runner, deps, schema), ...(storage ? [storageConfigurationHook(storage)] : [])], writeChecks: [runInputCheck, ...(storage ? [storageEndpointCheck(storage, allowPrivateAddresses)] : [])], jobs: [job, ...triggers.jobs, ...(revocations ? [revocations.job] : [])], onChanges: triggers.onChanges, types, readTrace: (runId: string) => readTrace(files(), runId) }
}
