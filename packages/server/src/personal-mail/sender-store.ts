import type { DBAdapter } from 'better-auth'
import { everyRow } from '../better-auth/organizations/store'

/** Better Auth's model for the From addresses people enter: one row per person and address. */
export const mailSenderModel = 'mailSender'

export const mailSenderSchema = {
  [mailSenderModel]: {
    modelName: 'mail_sender',
    fields: {
      userId: { type: 'string', required: true, fieldName: 'user_id' },
      address: { type: 'string', required: true },
      shared: { type: 'boolean', required: true },
      signature: { type: 'string', required: false },
      isDefault: { type: 'boolean', required: true, fieldName: 'is_default' },
      createdAt: { type: 'date', required: true, fieldName: 'created_at' },
    },
  },
} as const

/**
 * A From address its owner entered, in lowercase: shared with everyone in the app who sends mail or usable by its
 * owner alone, with its own signature or none, so the generic one applies, and whether it is the owner's default.
 */
export type MailSenderRow = { id: string; userId: string; address: string; shared: boolean; signature?: string | null; isDefault: boolean; createdAt: Date }

/** What sending reads of the entered addresses: a person's own, and the shared ones of everyone. */
export type MailSenderStore = {
  ofUser: (userId: string) => Promise<MailSenderRow[]>
  shared: () => Promise<MailSenderRow[]>
  /** The shared rows of `address`, oldest first. */
  sharedAs: (address: string) => Promise<MailSenderRow[]>
  /**
   * Whose shared addresses `userId` may send from: everyone's in an app without organizations (`everyone`), else those
   * of the people who are a member of an organization they are a member of too.
   */
  sharersFor: (userId: string) => Promise<'everyone' | Set<string>>
}

type Adapter = Pick<DBAdapter, 'findMany' | 'create' | 'update' | 'updateMany' | 'deleteMany'>

const oldestFirst = (rows: MailSenderRow[]) => rows.toSorted((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

/** The user's addresses, oldest first. */
export const sendersOf = async (adapter: Pick<Adapter, 'findMany'>, userId: string) =>
  oldestFirst(await adapter.findMany<MailSenderRow>({ model: mailSenderModel, where: [{ field: 'userId', value: userId }], limit: everyRow }))

/** Every shared address, oldest first, so the first owner to share an address is the one it sends through. */
export const sharedSenders = async (adapter: Pick<Adapter, 'findMany'>) =>
  oldestFirst(await adapter.findMany<MailSenderRow>({ model: mailSenderModel, where: [{ field: 'shared', value: true }], limit: everyRow }))

/** The shared rows of `address`, oldest first. */
export const sharedSendersAs = async (adapter: Pick<Adapter, 'findMany'>, address: string) =>
  oldestFirst(await adapter.findMany<MailSenderRow>({ model: mailSenderModel, where: [{ field: 'address', value: address }, { field: 'shared', value: true }], limit: everyRow }))

/** The people who share an organization with `userId`, themselves included: their memberships, then those organizations' members. */
export const organizationPeers = async (adapter: Pick<Adapter, 'findMany'>, userId: string) => {
  const memberships = await adapter.findMany<{ organizationId: string }>({ model: 'member', where: [{ field: 'userId', value: userId }], limit: everyRow })
  const organizationIds = [...new Set(memberships.map((member) => member.organizationId))]
  if (organizationIds.length === 0) return new Set([userId])
  const members = await adapter.findMany<{ userId: string }>({ model: 'member', where: [{ field: 'organizationId', value: organizationIds, operator: 'in' }], limit: everyRow })
  return new Set([userId, ...members.map((member) => member.userId)])
}

/**
 * The store as sending reads it, through Better Auth's adapter. With `organizations`, a shared address reaches only
 * the people who share an organization with its owner, so it never crosses from one organization to another.
 */
export const adapterSenderStore = (adapter: () => Promise<Pick<Adapter, 'findMany'>>, organizations: boolean): MailSenderStore => ({
  ofUser: async (userId) => sendersOf(await adapter(), userId),
  shared: async () => sharedSenders(await adapter()),
  sharedAs: async (address) => sharedSendersAs(await adapter(), address),
  sharersFor: async (userId) => (organizations ? organizationPeers(await adapter(), userId) : 'everyone'),
})

export const storeSender = (adapter: Pick<Adapter, 'create'>, data: Omit<MailSenderRow, 'id'>) =>
  adapter.create<Omit<MailSenderRow, 'id'>, MailSenderRow>({ model: mailSenderModel, data })

/** Changes the user's address `id`; one that is not theirs is left as it is, and answers null. */
export const changeSender = (adapter: Pick<Adapter, 'update'>, userId: string, id: string, update: Partial<Pick<MailSenderRow, 'shared' | 'signature' | 'isDefault'>>) =>
  adapter.update<MailSenderRow>({ model: mailSenderModel, where: [{ field: 'id', value: id }, { field: 'userId', value: userId }], update })

/** Makes none of the user's addresses their default, so their mailbox's own address is. */
export const clearDefault = (adapter: Pick<Adapter, 'updateMany'>, userId: string) =>
  adapter.updateMany({ model: mailSenderModel, where: [{ field: 'userId', value: userId }, { field: 'isDefault', value: true }], update: { isDefault: false } })

/** Deletes the user's address `id`; one that is not theirs, or gone already, is left as it is. */
export const deleteSender = (adapter: Pick<Adapter, 'deleteMany'>, userId: string, id: string) =>
  adapter.deleteMany({ model: mailSenderModel, where: [{ field: 'id', value: id }, { field: 'userId', value: userId }] })
