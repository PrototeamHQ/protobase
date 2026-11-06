import type { BetterAuthOptions } from 'better-auth'
import { APIError, getOAuthState } from 'better-auth/api'
import type { ConnectionEvents } from './connection-events'
import type { ResolvedConnection } from './declared-connections'

type DatabaseHooks = NonNullable<BetterAuthOptions['databaseHooks']>
type AccountHooks = NonNullable<DatabaseHooks['account']>
type SessionHooks = NonNullable<DatabaseHooks['session']>
type HookContext = { path?: string; params?: Record<string, string | undefined> } | null | undefined

const refused = () => new APIError('FORBIDDEN', { code: 'CONNECTION_NOT_SIGN_IN', message: 'This provider connects an account to a workflow; it does not sign in.' })

/**
 * The account and session hooks of workflow connections. An account of a connection's provider written by a link
 * resumes the triggers waiting on it. On the OAuth callback of a provider only connections use, an account written
 * without a link, and any session, are refused: a connected account never signs anyone in. Refreshing a token writes
 * the account off the callback, so it passes.
 */
export const connectionAccountHooks = (connections: readonly ResolvedConnection[], events: ConnectionEvents) => {
  const providers = new Set(connections.map(({ providerId }) => providerId))
  const own = new Set(connections.filter(({ declaration }) => 'oauth' in declaration).map(({ providerId }) => providerId))
  const onOwnCallback = (context: HookContext) => context?.path === '/callback/:id' && own.has(context.params?.id ?? '')
  const guard = async (_: unknown, context: HookContext) => {
    if (onOwnCallback(context) && !(await getOAuthState())?.link) throw refused()
  }
  const resume = async (account: { id: string; providerId: string }) => {
    if (providers.has(account.providerId) && (await getOAuthState())?.link) await events.linked(account.id)
  }
  const account: AccountHooks = { create: { before: guard, after: resume }, update: { before: guard, after: resume } }
  const session: SessionHooks = { create: { before: async (_, context) => { if (onOwnCallback(context)) throw refused() } } }
  return { account, session }
}

/** Runs each hook of `first` and then of `second`; their `before` hooks change no data, as neither returns any. */
export const bothAccountHooks = (first: AccountHooks, second: AccountHooks): AccountHooks => {
  const join = (stage: 'before' | 'after', operation: 'create' | 'update') => {
    const a = first[operation]?.[stage] as ((record: never, context: never) => Promise<unknown>) | undefined
    const b = second[operation]?.[stage] as ((record: never, context: never) => Promise<unknown>) | undefined
    if (!a || !b) return a ?? b
    return async (record: never, context: never) => {
      await a(record, context)
      return b(record, context)
    }
  }
  return {
    create: { before: join('before', 'create'), after: join('after', 'create') },
    update: { before: join('before', 'update'), after: join('after', 'update') },
  } as AccountHooks
}
