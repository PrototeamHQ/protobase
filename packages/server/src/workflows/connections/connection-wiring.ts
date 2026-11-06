import { sql } from 'kysely'
import { ConnectionError, type Plugin, type PluginConnection } from '@protobase/workflows/plugin'
import type { StepWiring } from '@protobase/workflows'
import type { TaskContext } from '@protobase/workflows'
import type { Deps } from '../../deps'
import type { Mailer } from '../../mail/smtp-mailer'
import { enablerMayUpdate } from './enabler-authority'
import { enablerMailbox } from './enabler-mailbox'
import type { SaverRoles } from '../plugin-records'
import type { TriggerConnect } from '../triggers/plugin-call'
import type { ConnectionAccounts } from './connection-accounts'
import { connectionConsent } from './connection-consent'
import { connectionTokens, type VersionRef } from './connection-tokens'

export type ConnectionWiringInput = {
  deps: () => Deps
  schema: string
  roles: SaverRoles
  accounts: ConnectionAccounts | undefined
  plugins: readonly Plugin[]
  connectionOf: Readonly<Record<string, string>>
  /** Mail from a person's own mailbox; none when the app links no mailboxes. */
  personalMailer?: (userId: string) => Mailer
}

// The accounts of an app without sign-in: none, so every connection is `not_connected`.
const noAccounts: ConnectionAccounts = { find: async () => undefined, accessToken: async () => undefined }

/**
 * The connections of an app's workflows: the consent a save checks as a version is turned on, and the connection each
 * step and trigger that declares one gets, bound by the version its run or trigger runs.
 */
export const connectionWiring = ({ deps, schema, roles, accounts = noAccounts, plugins, connectionOf, personalMailer }: ConnectionWiringInput) => {
  const declarationOf = (key: string) => {
    const [plugin, name] = key.split(':') as [string, string]
    return plugins.find((candidate) => candidate.name === plugin)?.connections?.[name]
  }
  const consent = connectionConsent({ accounts, declarationOf, connectionOf })
  const tokens = connectionTokens({ deps, schema, roles, accounts })
  const use = (type: string, version: () => Promise<VersionRef | undefined>, secret: (token: string) => void): PluginConnection | undefined => {
    const key = connectionOf[type]
    const declaration = key === undefined ? undefined : declarationOf(key)
    if (!key || !declaration) return
    const [plugin, name] = key.split(':') as [string, string]
    return tokens({ plugin, name, declaration, version, secret })
  }
  const runVersion = async (runId: string) => {
    const { rows } = await sql<{ workflow_id: string; version: number | null }>`select workflow_id, version from ${sql.id(schema, 'runs')} where id = ${runId}`.execute(deps().db)
    const run = rows[0]
    return run?.version == null ? undefined : { workflowId: run.workflow_id, version: run.version }
  }
  const step: StepWiring['connection'] = (stepId, name, task) =>
    use(stepId, () => runVersion(task.runId), task.secret) ?? { accessToken: () => Promise.reject(new ConnectionError('not_connected', `${stepId} signs in through "${name}", which this app does not declare`)) }
  const trigger: TriggerConnect = (row, secret) => use(row.type, async () => (row.workflow_id === null ? undefined : { workflowId: row.workflow_id, version: row.version }), secret)
  // Who turned the run's version on, while they may still change the workflow in its tenant; nobody otherwise.
  const runEnabler = async (runId: string) => {
    const { rows } = await sql<{ workflow_id: string; enabled_by: string | null; tenant_id: string | null }>`select r.workflow_id, v.enabled_by, v.tenant_id from ${sql.id(schema, 'runs')} r
      join ${sql.id(schema, 'versions')} v on v.workflow_id = r.workflow_id and v.version = r.version where r.id = ${runId}`.execute(deps().db)
    const row = rows[0]
    if (!row?.enabled_by) return null
    return (await enablerMayUpdate(deps().db, deps(), roles, row.enabled_by, row.tenant_id ?? undefined, row.workflow_id)) ? row.enabled_by : null
  }
  const mailbox = personalMailer && ((task: TaskContext) => enablerMailbox(() => runEnabler(task.runId), personalMailer))
  return { consent, step, trigger, mailbox }
}
