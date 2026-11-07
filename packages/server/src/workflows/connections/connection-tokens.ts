import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { ConnectionError, type ConnectionDeclaration, type PluginConnection } from '@protobase/workflows/plugin'
import type { Deps } from '../../deps'
import type { SaverRoles } from '../plugin-records'
import type { ConnectionAccounts } from './connection-accounts'
import { accountToken } from './account-token'
import type { ConnectionTexts } from './connection-texts'
import { enablerMayUpdate } from './enabler-authority'
import { singleFlight } from './single-flight'

/** The version a step's run or a trigger runs, by its workflow and number. */
export type VersionRef = { workflowId: string; version: number }

/** What a connection is looked up with: the plugin's declaration of it, and where its type runs. */
export type ConnectionUse = { plugin: string; name: string; declaration: ConnectionDeclaration; version: () => Promise<VersionRef | undefined>; secret: (token: string) => void }

export type ConnectionTokensInput = { deps: () => Deps; schema: string; roles: SaverRoles; accounts: ConnectionAccounts; refresh: ReturnType<typeof sharedRefresh>; text: ConnectionTexts }

type Consent = { account: string | null; enabled_by: string | null; tenant_id: string | null }

/**
 * An account's valid access token, refreshed when it expired, or always with `refresh`, with overlapping refreshes of
 * one account joined into one. A forced refresh joins only other forced ones, so it never takes the token a plain read
 * is giving back. Another worker may rotate the refresh token between this one's read (`before`, the stored refresh
 * token) and its refresh, which the provider then refuses: reading the account once more tells that apart, and the
 * stored token is then the fresh one. Undefined when the provider refused it.
 */
export const sharedRefresh = (accounts: ConnectionAccounts) => {
  const flight = singleFlight<string | undefined>()
  return async (userId: string, accountId: string, before: string | null, { refresh = false }: { refresh?: boolean } = {}) => {
    const key = refresh ? `${accountId}:refresh` : accountId
    const fetch = () => flight(key, () => accounts.accessToken(userId, accountId, refresh ? { refresh } : undefined))
    const token = await fetch()
    if (token) return token
    const after = await accounts.find(userId, accountId)
    if (!after || after.refreshToken === before) return
    return fetch()
  }
}

/**
 * The connection a step or trigger declared, bound by its workflow. Each `accessToken()` checks afresh, caching nothing:
 * the version it runs binds an account to the connection, the person who turned that version on may still update the
 * workflow in its tenant, and owns that account of the connection's provider with its scopes, before and after its
 * token is fetched (`accountToken`). Anything else is `not_connected`, with one message that tells nothing of whether
 * the account exists; a refresh the provider refuses is `link_expired`. The token is blanked out of all the step records (`secret`).
 */
export const connectionTokens = ({ deps, schema, roles, accounts, refresh, text }: ConnectionTokensInput) => {
  const tokenOf = accountToken({ accounts, refresh })
  return (use: ConnectionUse): PluginConnection => {
    const key = `${use.plugin}:${use.name}`
    const notConnected = () => new ConnectionError('not_connected', text('notConnected', { key }))
    return {
      accessToken: async (options) => {
        const ref = await use.version()
        if (!ref) throw notConnected()
        const db = deps().db
        const { rows } = await sql<Consent>`select v.definition -> 'connections' ->> ${key} as account, v.enabled_by, v.tenant_id
          from ${sql.id(schema, 'versions')} v where v.workflow_id = ${ref.workflowId} and v.version = ${ref.version}`.execute(db)
        const consent = rows[0]
        if (!consent?.account || !consent.enabled_by) throw notConnected()
        if (!(await enablerMayUpdate(db, deps(), roles, consent.enabled_by, consent.tenant_id ?? undefined, ref.workflowId))) throw notConnected()
        const token = await tokenOf({ ...use, userId: consent.enabled_by, accountId: consent.account }, notConnected, options)
        if (!token) throw new ConnectionError('link_expired', text('linkExpired', { key }))
        return token
      },
    }
  }
}

export type ConnectionTokens = ReturnType<typeof connectionTokens>
