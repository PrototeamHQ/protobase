import type { DBAdapter } from 'better-auth'

/**
 * Whether the account has a passkey or a second step, which confirm it's them; one with neither confirms a first one
 * with its password or an emailed code instead.
 */
export const hasPasskeyOrSecondStep = async (adapter: Pick<DBAdapter, 'count'>, user: { id: string; twoFactorEnabled?: boolean | null }) =>
  Boolean(user.twoFactorEnabled) || (await adapter.count({ model: 'passkey', where: [{ field: 'userId', value: user.id }] })) > 0
