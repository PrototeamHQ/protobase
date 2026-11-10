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
      name: { type: 'string', required: false },
      shared: { type: 'boolean', required: true },
      signature: { type: 'string', required: false },
      isDefault: { type: 'boolean', required: true, fieldName: 'is_default' },
      createdAt: { type: 'date', required: true, fieldName: 'created_at' },
    },
  },
} as const

/**
 * A From address its owner entered, in lowercase, usable by its owner alone, with the display name the From header shows
 * beside it or none, its own signature or none, so the generic one applies, and whether it is the owner's default. `shared` stays false: sharing an address with others
 * waits until the owner can prove the address is theirs.
 */
export type MailSenderRow = { id: string; userId: string; address: string; name?: string | null; shared: boolean; signature?: string | null; isDefault: boolean; createdAt: Date }

/** What sending reads of the entered addresses: a person's own. */
export type MailSenderStore = {
  ofUser: (userId: string) => Promise<MailSenderRow[]>
}

type Adapter = Pick<DBAdapter, 'findMany' | 'create' | 'update' | 'updateMany' | 'deleteMany'>

const oldestFirst = (rows: MailSenderRow[]) => rows.toSorted((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

/** The user's addresses, oldest first. */
export const sendersOf = async (adapter: Pick<Adapter, 'findMany'>, userId: string) =>
  oldestFirst(await adapter.findMany<MailSenderRow>({ model: mailSenderModel, where: [{ field: 'userId', value: userId }], limit: everyRow }))

/** The store as sending reads it, through Better Auth's adapter. */
export const adapterSenderStore = (adapter: () => Promise<Pick<Adapter, 'findMany'>>): MailSenderStore => ({
  ofUser: async (userId) => sendersOf(await adapter(), userId),
})

export const storeSender = (adapter: Pick<Adapter, 'create'>, data: Omit<MailSenderRow, 'id'>) =>
  adapter.create<Omit<MailSenderRow, 'id'>, MailSenderRow>({ model: mailSenderModel, data })

/** Changes the user's address `id`; one that is not theirs is left as it is, and answers null. */
export const changeSender = (adapter: Pick<Adapter, 'update'>, userId: string, id: string, update: Partial<Pick<MailSenderRow, 'name' | 'signature' | 'isDefault'>>) =>
  adapter.update<MailSenderRow>({ model: mailSenderModel, where: [{ field: 'id', value: id }, { field: 'userId', value: userId }], update })

/** Makes none of the user's addresses their default, so their mailbox's own address is. */
export const clearDefault = (adapter: Pick<Adapter, 'updateMany'>, userId: string) =>
  adapter.updateMany({ model: mailSenderModel, where: [{ field: 'userId', value: userId }, { field: 'isDefault', value: true }], update: { isDefault: false } })

/** Deletes the user's address `id`; one that is not theirs, or gone already, is left as it is. */
export const deleteSender = (adapter: Pick<Adapter, 'deleteMany'>, userId: string, id: string) =>
  adapter.deleteMany({ model: mailSenderModel, where: [{ field: 'id', value: id }, { field: 'userId', value: userId }] })
