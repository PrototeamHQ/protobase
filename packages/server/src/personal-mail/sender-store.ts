import type { DBAdapter } from 'better-auth'
import { everyRow } from '../better-auth/organizations/store'

/** Better Auth's model for the From addresses people enter: one row per person and address. */
export const mailSenderModel = 'mailSender'

/**
 * A From address its owner entered, in lowercase, with the display name the From header shows beside it or none, its
 * own signature or none, so the generic one applies, and whether it is the owner's default. `verifiedAccountId` is the
 * mailbox account a check proved the address goes out from, at `verifiedAt`, or none; `shared` lets the app's other
 * senders send from it through that mailbox, once verified. `checkToken`, a hash of the token of the check waiting for
 * its result, and `checkAccountId`, the mailbox account its test message went through, are none without one.
 */
export type MailSenderRow = {
  id: string
  userId: string
  address: string
  name?: string | null
  shared: boolean
  signature?: string | null
  isDefault: boolean
  createdAt: Date
  verifiedAt?: Date | null
  verifiedAccountId?: string | null
  checkToken?: string | null
  checkAccountId?: string | null
}

/** What sending reads of the entered addresses: a person's own, and those others share with them. */
export type MailSenderStore = {
  ofUser: (userId: string) => Promise<MailSenderRow[]>
  /**
   * The shared and verified addresses of the other people `userId` may send as, latest verification first: everyone's
   * in an app without organizations, else those of the people who are a member of an organization they are a member of too.
   */
  sharedWith: (userId: string) => Promise<MailSenderRow[]>
}

type Adapter = Pick<DBAdapter, 'findMany' | 'create' | 'update' | 'updateMany' | 'deleteMany'>

/** The user's addresses, oldest first. */
export const sendersOf = (adapter: Pick<Adapter, 'findMany'>, userId: string) =>
  adapter.findMany<MailSenderRow>({ model: mailSenderModel, where: [{ field: 'userId', value: userId }], sortBy: { field: 'createdAt', direction: 'asc' }, limit: everyRow })

/** The people who share an organization with `userId`, themselves included: their memberships, then those organizations' members. */
export const organizationPeers = async (adapter: Pick<Adapter, 'findMany'>, userId: string) => {
  const memberships = await adapter.findMany<{ organizationId: string }>({ model: 'member', where: [{ field: 'userId', value: userId }], limit: everyRow })
  const organizationIds = [...new Set(memberships.map((member) => member.organizationId))]
  if (organizationIds.length === 0) return [userId]
  const members = await adapter.findMany<{ userId: string }>({ model: 'member', where: [{ field: 'organizationId', value: organizationIds, operator: 'in' }], limit: everyRow })
  return [...new Set([userId, ...members.map((member) => member.userId)])]
}

/** The shared and verified addresses of `owners`, or of everyone, latest verification first. */
export const sharedSenders = (adapter: Pick<Adapter, 'findMany'>, owners: 'everyone' | string[]) =>
  adapter.findMany<MailSenderRow>({
    model: mailSenderModel,
    where: [
      { field: 'shared', value: true },
      { field: 'verifiedAccountId', operator: 'ne', value: null },
      ...(owners === 'everyone' ? [] : [{ field: 'userId', operator: 'in' as const, value: owners }]),
    ],
    sortBy: { field: 'verifiedAt', direction: 'desc' },
    limit: everyRow,
  })

/**
 * The store as sending reads it, through Better Auth's adapter, on every send. With `organizations`, a shared address
 * reaches only the people who share an organization with its owner now, so it never crosses from one organization to another.
 */
export const adapterSenderStore = (adapter: () => Promise<Pick<Adapter, 'findMany'>>, organizations: boolean): MailSenderStore => ({
  ofUser: async (userId) => sendersOf(await adapter(), userId),
  sharedWith: async (userId) => {
    const store = await adapter()
    const rows = await sharedSenders(store, organizations ? await organizationPeers(store, userId) : 'everyone')
    return rows.filter((row) => row.userId !== userId)
  },
})

export const storeSender = (adapter: Pick<Adapter, 'create'>, data: Omit<MailSenderRow, 'id'>) =>
  adapter.create<Omit<MailSenderRow, 'id'>, MailSenderRow>({ model: mailSenderModel, data })

/** Changes the user's address `id`; one that is not theirs is left as it is, and answers null. */
export const changeSender = (adapter: Pick<Adapter, 'update'>, userId: string, id: string, update: Partial<Pick<MailSenderRow, 'name' | 'signature' | 'isDefault' | 'shared'>>) =>
  adapter.update<MailSenderRow>({ model: mailSenderModel, where: [{ field: 'id', value: id }, { field: 'userId', value: userId }], update })

/** Makes none of the user's addresses their default, so their mailbox's own address is. */
export const clearDefault = (adapter: Pick<Adapter, 'updateMany'>, userId: string) =>
  adapter.updateMany({ model: mailSenderModel, where: [{ field: 'userId', value: userId }, { field: 'isDefault', value: true }], update: { isDefault: false } })

/** Deletes the user's address `id`; one that is not theirs, or gone already, is left as it is. */
export const deleteSender = (adapter: Pick<Adapter, 'deleteMany'>, userId: string, id: string) =>
  adapter.deleteMany({ model: mailSenderModel, where: [{ field: 'id', value: id }, { field: 'userId', value: userId }] })

/** Records the check waiting for the user's address `id`, replacing one waiting already. */
export const startCheck = (adapter: Pick<Adapter, 'update'>, userId: string, id: string, check: Required<Pick<MailSenderRow, 'checkToken' | 'checkAccountId'>>) =>
  adapter.update<MailSenderRow>({ model: mailSenderModel, where: [{ field: 'id', value: id }, { field: 'userId', value: userId }], update: check })

/**
 * Ends the check `checkToken` of the user's address `id`: a confirmed one makes the address verified through the
 * account its test went through, now; either way no check waits any longer. One already ended changes nothing and
 * answers null, so a check confirms once.
 */
export const endCheck = (adapter: Pick<Adapter, 'update'>, userId: string, id: string, checkToken: string, verified?: { accountId: string; at: Date }) =>
  adapter.update<MailSenderRow>({
    model: mailSenderModel,
    where: [{ field: 'id', value: id }, { field: 'userId', value: userId }, { field: 'checkToken', value: checkToken }],
    update: { checkToken: null, checkAccountId: null, ...(verified && { verifiedAccountId: verified.accountId, verifiedAt: verified.at }) },
  })

/** Makes the user's addresses a check proved through another account than `accountId` no longer verified, as when mail goes through a new link. */
export const unverifyOtherAccounts = (adapter: Pick<Adapter, 'updateMany'>, userId: string, accountId: string) =>
  adapter.updateMany({
    model: mailSenderModel,
    where: [{ field: 'userId', value: userId }, { field: 'verifiedAccountId', operator: 'ne', value: accountId }],
    update: { verifiedAccountId: null, verifiedAt: null },
  })
