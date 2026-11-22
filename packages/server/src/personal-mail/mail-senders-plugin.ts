import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { headersLocale } from '../locale/request-locale'
import { idTokenAddress, storedScopes } from './linked-accounts'
import type { PersonalMailProvider } from './personal-mail-provider'
import { linkedMailbox } from './personal-mailer'
import type { BetterAuthNames } from '../better-auth/names/better-auth-names'
import type { MailSenderUseCheck } from './mail-sender-use-check'
import type { AliasChecks } from './alias-checks'
import { changeSender, clearDefault, deleteSender, mailSenderModel, sendersOf, storeSender, type MailSenderRow } from './sender-store'

/** The paths of the person's From addresses, as Better Auth names them under the auth base path. */
export const mailSenderPaths = {
  list: '/account/mail-senders',
  add: '/account/mail-senders/add',
  update: '/account/mail-senders/update',
  remove: '/account/mail-senders/remove',
  check: '/account/mail-senders/check',
  checkResult: '/account/mail-senders/check-result',
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

type StoredAccount = { id: string; providerId: string; scope?: string | null; idToken?: string | null; createdAt: Date }

// The account the person's mail goes through, with its own address when its link names it.
const mailboxOf = (accounts: StoredAccount[], providers: PersonalMailProvider[]) => {
  const linked = linkedMailbox(
    accounts.map((account) => ({ id: account.id, providerId: account.providerId, scopes: storedScopes(account.scope), createdAt: account.createdAt })),
    providers,
  )
  if (!linked) return
  const address = idTokenAddress(accounts.find((account) => account.id === linked.account.id)?.idToken)
  return { accountId: linked.account.id, ...(address && { address }) }
}

// Better Auth's own path that disconnects one of the person's accounts, their mailbox's included.
const unlinkPath = '/unlink-account'

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
 * none; `POST /account/mail-senders/remove { id }` deletes one. Each acts on the session's own person only. While
 * records of the app hold an address (`inUse`), removing it, or disconnecting the mailbox whose own address it is
 * (`/unlink-account`), is refused with a 409, and changes nothing.
 *
 * With `checks`, the list says `checks: true`, and `POST /account/mail-senders/check { id }` sends a test message from
 * one of the person's addresses through their mailbox and answers `{ status: 'waiting', check }`; `POST
 * /account/mail-senders/check-result { id, check }` answers where it stands (`AliasCheckResult`). Without, the check
 * answers `{ status: 'unchecked' }` and sends nothing.
 */
export const mailSendersPlugin = (providers: PersonalMailProvider[], names: BetterAuthNames, inUse?: MailSenderUseCheck, checks?: AliasChecks) =>
  ({
    id: 'protobase-mail-senders',
    schema: names.tables(mailSenderModel),
    hooks: {
      before: [
        {
          matcher: (context) => context.path === unlinkPath,
          handler: createAuthMiddleware(async (ctx) => {
            const accountId = (ctx.body as { accountId?: unknown } | undefined)?.accountId
            const session = inUse && typeof accountId === 'string' ? await getSessionFromCtx(ctx) : null
            if (!session) return
            const mailbox = mailboxOf(await ctx.context.internalAdapter.findAccounts(session.user.id), providers)
            if (mailbox?.address && mailbox.accountId === accountId) await inUse!.refuse(mailbox.address, headersLocale(ctx.headers))
          }),
        },
      ],
    },
    endpoints: {
      listMailSenders: createAuthEndpoint(mailSenderPaths.list, { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
        const userId = ctx.context.session.user.id
        const [rows, accounts] = await Promise.all([sendersOf(ctx.context.adapter, userId), ctx.context.internalAdapter.findAccounts(userId)])
        const address = mailboxOf(accounts, providers)?.address
        return ctx.json({ ...(address && { address }), senders: rows.map(listed), checks: Boolean(checks) })
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
        const userId = ctx.context.session.user.id
        const found = (await sendersOf(ctx.context.adapter, userId)).find((row) => row.id === ctx.body.id)
        if (found && inUse) await inUse.refuse(found.address, headersLocale(ctx.headers))
        await deleteSender(ctx.context.adapter, userId, ctx.body.id)
        return ctx.json({ removed: true })
      }),

      checkMailSender: createAuthEndpoint(mailSenderPaths.check, { method: 'POST', use: [sessionMiddleware], body: z.object({ id: z.string().min(1) }) }, async (ctx) => {
        const userId = ctx.context.session.user.id
        const found = (await sendersOf(ctx.context.adapter, userId)).find((row) => row.id === ctx.body.id)
        if (!found) throw new APIError('NOT_FOUND', notFound)
        if (!checks) return ctx.json({ status: 'unchecked' as const })
        const check = await checks.start(userId, found.address, headersLocale(ctx.headers))
        return ctx.json({ status: 'waiting' as const, check })
      }),

      checkMailSenderResult: createAuthEndpoint(
        mailSenderPaths.checkResult,
        { method: 'POST', use: [sessionMiddleware], body: z.object({ id: z.string().min(1), check: z.string().min(1).max(200) }) },
        async (ctx) => {
          const found = (await sendersOf(ctx.context.adapter, ctx.context.session.user.id)).find((row) => row.id === ctx.body.id)
          if (!found) throw new APIError('NOT_FOUND', notFound)
          if (!checks) return ctx.json({ status: 'unchecked' as const })
          return ctx.json(await checks.result(ctx.body.check, found.address))
        },
      ),
    },
  }) satisfies BetterAuthPlugin
