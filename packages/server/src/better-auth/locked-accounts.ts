import type { BetterAuthPlugin, DBAdapter, Where } from 'better-auth'
import { APIError } from 'better-auth/api'

export const lockedAccountsVariable = 'PROTOBASE_LOCKED_ACCOUNTS'

/** The addresses the platform passes in `PROTOBASE_LOCKED_ACCOUNTS`, comma separated, in lower case; none when it is unset. */
export const readLockedAccounts = (env: Record<string, string | undefined>) =>
  [...new Set((env[lockedAccountsVariable] ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))]

// The writes the guard sees: the store's adapter, or the one of a transaction on it.
type Writes = Omit<DBAdapter, 'transaction'>

// The fields of each guarded model that a locked account keeps; a sign-in still writes the others, such as a passkey's counter.
const lockedFields: Record<string, (field: string) => boolean> = {
  user: (field) => ['email', 'emailVerified', 'twoFactorEnabled'].includes(field),
  account: (field) => ['userId', 'providerId', 'accountId', 'password'].includes(field),
  passkey: (field) => !['counter', 'updatedAt'].includes(field),
  twoFactor: (field) => !['failedVerificationCount', 'lockedUntil', 'updatedAt'].includes(field),
}

/** Refuses, with `403 ACCOUNT_LOCKED`, a change to or the deletion of a locked account. */
export const refuseLockedAccount = (): never => {
  throw new APIError('FORBIDDEN', { code: 'ACCOUNT_LOCKED', message: 'This account is locked: its address, password, passkeys, two-factor authentication and linked accounts stay as they are, and it cannot be deleted.' })
}

/**
 * The adapter with the accounts of `emails` locked: their user's address, password, passkeys, two-factor
 * authentication and linked accounts stay as they are, and the user is not deleted, whatever endpoint or host call
 * writes. A locked account's first account row, made with its user, is the one write of those it allows.
 */
export const lockAccounts = <A extends Writes>(adapter: A, emails: string[]): A => {
  const lockedIds = async () =>
    new Set((await adapter.findMany<{ id: string }>({ model: 'user', where: [{ field: 'email', operator: 'in', value: emails }], select: ['id'] })).map((user) => user.id))
  // Whether `where` matches a row of a locked account; the user's own row is matched by its `id`.
  const matchesLocked = async (model: string, where: Where[]) => {
    const ids = await lockedIds()
    if (ids.size === 0) return false
    const owner = model === 'user' ? 'id' : 'userId'
    const rows = await adapter.findMany<Record<string, string>>({ model, where, select: [owner] })
    return rows.some((row) => ids.has(row[owner]!))
  }
  const checkUpdate = async (model: string, where: Where[], fields: string[]) => {
    const locked = lockedFields[model]
    if (locked && fields.some(locked) && (await matchesLocked(model, where))) refuseLockedAccount()
  }
  const checkDelete = async (model: string, where: Where[]) => {
    if (lockedFields[model] && (await matchesLocked(model, where))) refuseLockedAccount()
  }
  const checkCreate = async (model: string, data: Record<string, unknown>) => {
    if (model === 'user' || !lockedFields[model]) return
    if (!(await lockedIds()).has(data.userId as string)) return
    if (model === 'account' && (await adapter.count({ model: 'account', where: [{ field: 'userId', value: data.userId as string }] })) === 0) return
    refuseLockedAccount()
  }
  return {
    ...adapter,
    create: async (data) => {
      await checkCreate(data.model, data.data)
      return adapter.create(data)
    },
    update: async (data) => {
      await checkUpdate(data.model, data.where, Object.keys(data.update))
      return adapter.update(data)
    },
    updateMany: async (data) => {
      await checkUpdate(data.model, data.where, Object.keys(data.update))
      return adapter.updateMany(data)
    },
    incrementOne: async (data) => {
      await checkUpdate(data.model, data.where, [...Object.keys(data.increment), ...Object.keys(data.set ?? {})])
      return adapter.incrementOne(data)
    },
    delete: async (data) => {
      await checkDelete(data.model, data.where)
      return adapter.delete(data)
    },
    deleteMany: async (data) => {
      await checkDelete(data.model, data.where)
      return adapter.deleteMany(data)
    },
    consumeOne: async (data) => {
      await checkDelete(data.model, data.where)
      return adapter.consumeOne(data)
    },
  } as A
}

/**
 * Locks the accounts of `emails` (see `lockAccounts`) by guarding the auth store's adapter, which Better Auth's own
 * writes, its plugins' (passkeys and two-factor authentication write the store directly, past the database hooks)
 * and the host calls all go through, also in a transaction.
 */
export const lockedAccountsPlugin = (emails: string[]) =>
  ({
    id: 'protobase-locked-accounts',
    init: (ctx) => {
      const adapter = ctx.adapter
      const guarded: DBAdapter = { ...lockAccounts(adapter, emails), transaction: (callback) => adapter.transaction((trx) => callback(lockAccounts(trx, emails))) }
      return { context: { adapter: guarded } }
    },
  }) satisfies BetterAuthPlugin
