import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { usedConnections, type Definition } from '@protobase/workflows'
import type { ConnectionDeclaration } from '@protobase/workflows/plugin'
import { ownSignInUser } from '../../notifications/caller'
import { badRequest, forbidden } from '../../problem'
import type { Session } from '../../types'
import type { ConnectionAccounts } from './connection-accounts'
import { connectionProviderId, holdsScopes } from './connection-provider'

/** What the consent reads: the connected accounts, each connection's declaration by `<plugin>:<connection>`, and each type's connection by its id. */
export type ConsentInput = {
  accounts: ConnectionAccounts
  declarationOf: (key: string) => ConnectionDeclaration | undefined
  connectionOf: Readonly<Record<string, string>>
}

/** The refusal of every account the caller may not turn on, the same whether it exists or not. */
export const notOwnConnection = () =>
  forbidden('own-sign-in-only', 'Only the owner of each connection this workflow uses, signed in as themselves, can turn it on: turn it off to save it, and its owner turns it on again in the admin app')

/**
 * Turning a version on is the consent that lets its runs sign in through the accounts it binds: it is refused unless
 * the caller is signed in as themselves (not staff signed in as them, nor an outside app acting for them) and owns
 * every bound account, of its connection's provider and holding its scopes. Returns who consented, which the version
 * keeps as `enabled_by`: the caller when they are signed in as themselves, else nobody, as for a version that binds
 * no account turned on by an outside app.
 */
export const connectionConsent = ({ accounts, declarationOf, connectionOf }: ConsentInput) => async (session: Session, definition: Definition) => {
  const keys = [...usedConnections(definition, connectionOf)]
  if (keys.length === 0) {
    if (session.anonymous || session.client || session.signIn?.staff !== false) return null
    return String(session.user.id)
  }
  const unbound = keys.filter((key) => !definition.connections?.[key])
  if (unbound.length > 0) throw badRequest('invalid-workflow', `Connect an account for ${unbound.join(', ')} in the workflow's connections before turning it on`)
  const userId = ownSignInUser(session, 'turn on a workflow that signs in through their connection')
  for (const key of keys) {
    const declaration = declarationOf(key)!
    const [plugin, name] = key.split(':') as [string, string]
    const account = await accounts.find(userId, definition.connections![key]!)
    if (!account || account.providerId !== connectionProviderId(plugin, name, declaration) || !holdsScopes(account.scopes, declaration)) throw notOwnConnection()
  }
  return userId
}

export type ConnectionConsent = ReturnType<typeof connectionConsent>

/**
 * Keeps who turned a version on, as its runs' steps read it, and withdraws the consent when the workflow is turned
 * off: every version's runs then sign in through no account until it is turned on again.
 */
export const saveConsent = async (trx: Db, schema: string, workflowId: string, enabled: number | null, enabledBy: string | null) => {
  const versions = sql.id(schema, 'versions')
  if (enabled === null) {
    await sql`update ${versions} set enabled_by = null where workflow_id = ${workflowId} and enabled_by is not null`.execute(trx)
    return
  }
  await sql`update ${versions} set enabled_by = ${enabledBy} where workflow_id = ${workflowId} and version = ${enabled}`.execute(trx)
}
