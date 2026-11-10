import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { idTokenAddress, storedScopes } from './linked-accounts'
import type { PersonalMailProvider } from './personal-mail-provider'
import { linkedMailbox } from './personal-mailer'
import { changeSender, clearDefault, deleteSender, mailSenderSchema, sendersOf, storeSender, type MailSenderRow } from './sender-store'

/** The paths of the person's From addresses, as Better Auth names them under the auth base path. */
export const mailSenderPaths = {
  list: '/account/mail-senders',
  add: '/account/mail-senders/add',
  update: '/account/mail-senders/update',
  remove: '/account/mail-senders/remove',
}

/** The most addresses one person may enter, well above the send-as addresses a mailbox has. */
export const maxSenders = 50

/** The longest signature, in characters: a closing and a few lines of contact details. */
export const maxSignatureLength = 2000

/** The longest display name, in characters: a person's or a business's name, with a department. */
export const maxSenderNameLength = 100

/** An address as one entered it, as the account page lists it. */
export type ListedMailSender = { id: string; address: string; name?: string; signature?: string; isDefault: boolean }

const listed = (row: MailSenderRow): ListedMailSender => ({
  id: row.id,
  address: row.address,
  ...(row.name && { name: row.name }),
  ...(row.signature && { signature: row.signature }),
  isDefault: row.isDefault,
})

const tooMany = { code: 'TOO_MANY_MAIL_SENDERS', message: `You can enter at most ${maxSenders} From addresses.` }
const taken = { code: 'MAIL_SENDER_EXISTS', message: 'You entered this address already.' }
const notFound = { code: 'MAIL_SENDER_NOT_FOUND', message: 'This address is not one you entered.' }

// A signature of only blanks is none, so the generic one applies.
const signatureField = z.string().max(maxSignatureLength).transform((value) => (value.trim() ? value : null))

// A name of only blanks is none, so the From header shows the bare address. A line break would end the header.
const nameField = z
  .string()
  .max(maxSenderNameLength)
  .regex(/^[^\r\n]*$/)
  .transform((value) => value.trim() || null)

/**
 * The From addresses the signed-in person sends mail from through the mailbox they linked, such as the send-as
 * addresses of their Gmail: `GET /account/mail-senders` lists them, oldest first, with their mailbox's own `address`
 * when its link names it; `POST /account/mail-senders/add { address, name?, signature? }` enters one, usable by them alone,
 * with the display name the From header shows beside it; `POST /account/mail-senders/update { id, name?, signature?, isDefault? }`
 * changes one, `name: null` dropping its name, `signature: null` dropping its own, and `isDefault` making it, or no longer making it, the address mail goes out from when the app names
 * none; `POST /account/mail-senders/remove { id }` deletes one. Each acts on the session's own person only.
 */
export const mailSendersPlugin = (providers: PersonalMailProvider[]) =>
  ({
    id: 'protobase-mail-senders',
    schema: mailSenderSchema,
    endpoints: {
      listMailSenders: createAuthEndpoint(mailSenderPaths.list, { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
        const userId = ctx.context.session.user.id
        const [rows, accounts] = await Promise.all([sendersOf(ctx.context.adapter, userId), ctx.context.internalAdapter.findAccounts(userId)])
        const linked = linkedMailbox(
          accounts.map((account) => ({ id: account.id, providerId: account.providerId, scopes: storedScopes(account.scope), createdAt: account.createdAt })),
          providers,
        )
        const address = linked && idTokenAddress(accounts.find((account) => account.id === linked.account.id)?.idToken)
        return ctx.json({ ...(address && { address }), senders: rows.map(listed) })
      }),

      addMailSender: createAuthEndpoint(
        mailSenderPaths.add,
        { method: 'POST', use: [sessionMiddleware], body: z.object({ address: z.email().max(254), name: nameField.optional(), signature: signatureField.optional() }) },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const address = ctx.body.address.toLowerCase()
          const rows = await sendersOf(ctx.context.adapter, userId)
          if (rows.length >= maxSenders) throw new APIError('BAD_REQUEST', tooMany)
          if (rows.some((row) => row.address === address)) throw new APIError('BAD_REQUEST', taken)
          // Never shared: sharing an address with others waits until the person can prove it is theirs.
          const { name = null, signature = null } = ctx.body
          const row = await storeSender(ctx.context.adapter, { userId, address, name, shared: false, signature, isDefault: false, createdAt: new Date() })
          return ctx.json({ sender: listed(row) })
        },
      ),

      updateMailSender: createAuthEndpoint(
        mailSenderPaths.update,
        { method: 'POST', use: [sessionMiddleware], body: z.object({ id: z.string().min(1), name: nameField.nullable().optional(), signature: signatureField.nullable().optional(), isDefault: z.boolean().optional() }),
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const { id, isDefault, ...update } = ctx.body
          const found = (await sendersOf(ctx.context.adapter, userId)).find((row) => row.id === id)
          if (!found) throw new APIError('NOT_FOUND', notFound)
          const changes = { ...update, ...(isDefault !== undefined && { isDefault }) }
          if (Object.keys(changes).length === 0) return ctx.json({ sender: listed(found) })
          // One default at most: the old one gives way first, as the store's unique index on it requires.
          if (isDefault === true) await clearDefault(ctx.context.adapter, userId)
          const row = await changeSender(ctx.context.adapter, userId, id, changes)
          if (!row) throw new APIError('NOT_FOUND', notFound)
          return ctx.json({ sender: listed(row) })
        },
      ),

      removeMailSender: createAuthEndpoint(mailSenderPaths.remove, { method: 'POST', use: [sessionMiddleware], body: z.object({ id: z.string().min(1) }) }, async (ctx) => {
        await deleteSender(ctx.context.adapter, ctx.context.session.user.id, ctx.body.id)
        return ctx.json({ removed: true })
      }),
    },
  }) satisfies BetterAuthPlugin
