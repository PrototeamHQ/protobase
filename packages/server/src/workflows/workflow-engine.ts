import { sql } from 'kysely'
import { parseSize } from '@protobase/schema/internal'
import type { AdminAuth } from '../better-auth/create-auth'
import type { Deps } from '../deps'
import { betterAuthOwnerRoles } from '../webhooks/table/owner-roles'
import { runInputCheck } from './input-limits'
import { checkpointValues } from './checkpoint-values'
import { workflowSecrets, workflowsSchema, workflowsTraceMode, type WorkflowsOptions } from './options'
import { scratchFiles } from './scratch-files'
import { readTrace, traceSink } from './trace-sink'
import { workflowSaveHook } from './save-hook'
import { workflowsRunner } from './segment-job'
import { runStartHook } from './start-hook'
import { stepTypeNames, stepTypes } from './step-types'

/**
 * What `createAdmin` needs for `workflows`: the hooks that check saves and start runs, the check of a run's input before
 * it is validated, and the segment job, whose step types act on records as each workflow's last editor (from Better
 * Auth unless the options say otherwise), and which keeps runs' traces and large values in the private file provider.
 */
export const workflowEngine = (options: WorkflowsOptions, deps: () => Deps, auth?: AdminAuth) => {
  const schema = workflowsSchema(options)
  const roles = options.savedByRoles ?? (auth && betterAuthOwnerRoles(auth))
  if (!roles) throw new Error("workflows act on records as each workflow's last editor, with their current roles: give the config `auth` (Better Auth), or `workflows.savedByRoles`")
  const scratch = options.scratch && scratchFiles({ dir: options.scratch.dir, maxBytes: parseSize(options.scratch.maxSize ?? '1 GB') })
  const input = { deps, schema, roles, allowPrivateAddresses: Boolean(options.allowPrivateAddresses), ...(scratch && { scratch }) }
  const secrets = workflowSecrets(options, globalThis.process?.env ?? {})
  const files = () => deps().files
  const kept = async (runId: string, file: string) => void (await sql`update ${sql.id(schema, 'runs')} set trace_file = ${file} where id = ${runId}`.execute(deps().db))
  const trace = traceSink({ files, kept, report: (error) => deps().report(error) })
  const values = checkpointValues(files, scratch)
  const { runner, job } = workflowsRunner({ schema, tasks: (context) => stepTypes(input, context.mail), secrets, values, trace, traceMode: workflowsTraceMode(options) })
  return { hooks: [workflowSaveHook(schema, stepTypeNames), runStartHook(runner, deps)], writeChecks: [runInputCheck], job, readTrace: (runId: string) => readTrace(files(), runId) }
}
