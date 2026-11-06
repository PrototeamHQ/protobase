import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { ConnectionError, type ConnectionDeclaration, type PluginConnection } from '@protobase/workflows/plugin'
import type { Deps } from '../../deps'
import type { SaverRoles } from '../plugin-records'
import type { ConnectionAccounts } from './connection-accounts'
import { connectionProviderId, holdsScopes } from './connection-provider'
import { enablerMayUpdate } from './enabler-authority'
import { singleFlight } from './single-flight'

/** The version a step's run or a trigger runs, by its workflow and number. */
export type VersionRef = { workflowId: string; version: number }

/** What a connection is looked up with: the plugin's declaration of it, and where its type runs. */
export type ConnectionUse = { plugin: string; name: string; declaration: ConnectionDeclaration; version: () => Promise<VersionRef | undefined>; secret: (token: string) => void }

export type ConnectionTokensInput = { deps: () => Deps; schema: string; roles: SaverRoles; accounts: ConnectionAccounts }

type Consent = { account: string | null; enabled_by: string | null; tenant_id: string | null }

/**
 * An account's valid access token, refreshed when it expired, with overlapping refreshes of one account joined into
 * one. Another worker may rotate the refresh token between this one's read (`before`, the stored refresh token) and its
 * refresh, which the provider then refuses: reading the account once more tells that apart, and the stored token is
 * then the fresh one. Undefined when the provider refused it.
 */
export const sharedRefresh = (accounts: ConnectionAccounts) => {
  const refresh = singleFlight<string | undefined>()
  return async (userId: string, accountId: string, before: string | null) => {
    const token = await refresh(accountId, () => accounts.accessToken(userId, accountId))
    if (token) return token
    const after = await accounts.find(userId, accountId)
    if (!after || after.refreshToken === before) return
    return refresh(accountId, () => accounts.accessToken(userId, accountId))
  }
}

/**
 * The connection a step or trigger declared, bound by its workflow. Each `accessToken()` checks afresh, caching nothing:
 * the version it runs binds an account to the connection, the person who turned that version on owns that account of
 * the connection's provider with its scopes, and may still update the workflow in its tenant. Anything else is
 * `not_connected`, with one message that tells nothing of whether the account exists; a refresh the provider refuses
 * is `link_expired`. The token is blanked out of all the step records (`secret`).
 */
export const connectionTokens = ({ deps, schema, roles, accounts }: ConnectionTokensInput) => {
  const tokenOf = sharedRefresh(accounts)

  return (use: ConnectionUse): PluginConnection => {
    const key = `${use.plugin}:${use.name}`
    const notConnected = () => new ConnectionError('not_connected', `This workflow has no connection it may use for ${key}: its owner connects an account and turns the workflow on`)
    return {
      accessToken: async () => {
        const ref = await use.version()
        if (!ref) throw notConnected()
        const db = deps().db
        const { rows } = await sql<Consent>`select v.definition -> 'connections' ->> ${key} as account, v.enabled_by, v.tenant_id
          from ${sql.id(schema, 'versions')} v where v.workflow_id = ${ref.workflowId} and v.version = ${ref.version}`.execute(db)
        const consent = rows[0]
        if (!consent?.account || !consent.enabled_by) throw notConnected()
        if (!(await enablerMayUpdate(db, deps(), roles, consent.enabled_by, consent.tenant_id ?? undefined, ref.workflowId))) throw notConnected()
        const account = await accounts.find(consent.enabled_by, consent.account)
        if (!account || account.providerId !== connectionProviderId(use.plugin, use.name, use.declaration) || !holdsScopes(account.scopes, use.declaration)) throw notConnected()
        const token = await tokenOf(consent.enabled_by, account.id, account.refreshToken)
        if (!token) throw new ConnectionError('link_expired', `The account connected for ${key} no longer signs in: its owner connects it again`)
        use.secret(token)
        return token
      },
    }
  }
}

export type ConnectionTokens = ReturnType<typeof connectionTokens>
