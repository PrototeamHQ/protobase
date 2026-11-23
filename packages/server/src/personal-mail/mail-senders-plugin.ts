import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { headersLocale } from '../locale/request-locale'
import { storeSqlOf } from '../better-auth/store/store-sql'
import type { BetterAuthNames } from '../better-auth/names/better-auth-names'
import type { AuthContext } from '../better-auth/organizations/store'
import type { PersonalMailProvider } from './personal-mail-provider'
import { linkedMailbox, type PersonalMail } from './personal-mailer'
import type { MailSenderUseCheck } from './mail-sender-use-check'
import { senderBook, linkedAccountsOf } from './mail-sender-book'
import { listedMailSenders, listedSender, listedVerification } from './listed-mail-senders'
import { stateIn } from './mail-sender'
import { isRemoved } from './sender-address-state'
import { senderAddressInput } from './sender-address-input'
import { mailSenderModel, sqlSenderStore } from './sender-store'
import type { SharedSenderReader } from './shared-sender-store'
import { listedShared, usableShared } from './shared-senders'
import { reportEndpoint } from './verifiers/report-endpoint'
import type { SenderVerifications } from './verifiers/sender-verifications'

/** The paths of the person's From addresses, as Better Auth names them under the auth base path. */
export const mailSenderPaths = {
  list: '/account/mail-senders',
  add: '/account/mail-senders/add',
  update: '/account/mail-senders/update',
  remove: '/account/mail-senders/remove',
  refresh: '/account/mail-senders/refresh',
  verify: '/account/mail-senders/verify',
  share: '/account/mail-senders/share',
  unshare: '/account/mail-senders/unshare',
}

/** The most addresses one person may have, well above the send-as addresses a mailbox has. */
export const maxSenders = 50

/** The longest signature, in characters: a closing and a few lines of contact details. */
export const maxSignatureLength = 2000

/** The longest display name, in characters: a person's or a business's name, with a department. */
export const maxSenderNameLength = 100

const tooMany = { code: 'TOO_MANY_MAIL_SENDERS', message: `You can have at most ${maxSenders} From addresses.` }
const taken = { code: 'MAIL_SENDER_EXISTS', message: 'You entered this address already.' }
const notFound = { code: 'MAIL_SENDER_NOT_FOUND', message: 'This address is not one of yours.' }
const noMailbox = { code: 'MAILBOX_NOT_FOUND', message: 'Connect a mailbox first.' }
const notVerified = { code: 'MAIL_SENDER_NOT_VERIFIED', message: 'Only a verified address can be shared: prove it is yours first.' }

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

const idField = z.string().min(1).max(200)

type Ctx = { context: AuthContext & { session: { user: { id: string } } } }

// The session's own rows, accounts and proofs, read together: every endpoint below acts on these alone.
const bookOf = async (ctx: Ctx, providers: PersonalMailProvider[], verifications?: SenderVerifications) => {
  const userId = ctx.context.session.user.id
  const store = sqlSenderStore(async () => storeSqlOf(ctx.context))
  const [rows, accounts, proofs] = await Promise.all([store.ofUser(userId), ctx.context.internalAdapter.findAccounts(userId), verifications ? verifications.proofsOf(userId) : []])
  return { userId, store, accounts, book: { ...senderBook(userId, rows, accounts, providers), proofs } }
}

// The person's own address `id`, not removed: anyone else's, an unknown one and a removed one alike are not found.
const ownRow = <Row extends { id: string; typedAt: Date | null; removedAt: Date | null }>(rows: Row[], id: string) => {
  const row = rows.find((candidate) => candidate.id === id)
  if (!row || isRemoved(row)) throw new APIError('NOT_FOUND', notFound)
  return row
}

/**
 * The From addresses the signed-in person sends mail as, each on one of their mailbox connections, with its state:
 * `GET /account/mail-senders` lists them, oldest first, with their mailbox's own `address` when its link names it and
 * their `connections`; `POST /account/mail-senders/add { address, name?, signature?, connection? }` types one on the
 * connection given, else the one mail goes through, `unverified` until the provider lists it; `POST
 * /account/mail-senders/update { id, name?, signature?, isDefault? }` changes one, `name: null` dropping its name,
 * `signature: null` dropping its own, and `isDefault` making it, or no longer making it, the address mail goes out from
 * when the app names none; `POST /account/mail-senders/remove { id }` removes one; `POST /account/mail-senders/refresh`
 * lists the send-as addresses of each connection whose provider can, answering how each went. Each acts on the
 * session's own addresses and connections only: any other id answers 404 before anything is done. While records of
 * the app hold an address (`inUse`), removing it, or disconnecting the mailbox whose own address it is
 * (`/unlink-account`), is refused with a 409, and changes nothing.
 *
 * With the app's `verifications` (`add_verifier`), the list says `verifiers: true` and gives each address its latest
 * verification by each verifier; `POST /account/mail-senders/verify { id }` starts every verifier on one of the
 * person's addresses on a connection they can send through, and answers that address's `verifications`; and
 * `POST /mail-sender-verifications/report` settles one from outside (`reportEndpoint`). Without, neither path exists.
 *
 * `POST /account/mail-senders/share { id }` shares one of the person's addresses with the app's other senders, refused
 * with a 409 `MAIL_SENDER_NOT_VERIFIED` unless it is `verified`; `POST /account/mail-senders/unshare { id }` makes it
 * theirs alone again. The list answers, as `shared`, the verified addresses others shared with the person that are in
 * reach (`sharedWith`), each by id, address and display name alone.
 */
export const mailSendersPlugin = (providers: PersonalMailProvider[], names: BetterAuthNames, mailOf: (userId: string) => PersonalMail, inUse?: MailSenderUseCheck, verifications?: SenderVerifications, sharedWith?: SharedSenderReader) =>
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
            const mailbox = linkedMailbox(linkedAccountsOf(await ctx.context.internalAdapter.findAccounts(session.user.id)), providers)
            if (mailbox?.account.address && mailbox.account.id === accountId) await inUse!.refuse(mailbox.account.address, headersLocale(ctx.headers))
          }),
        },
      ],
    },
    endpoints: {
      listMailSenders: createAuthEndpoint(mailSenderPaths.list, { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
        const { userId, book } = await bookOf(ctx, providers, verifications)
        const [latest, shared] = await Promise.all([verifications ? verifications.latestOf(userId) : undefined, sharedWith ? sharedWith(userId) : []])
        return ctx.json({ ...listedMailSenders(book, latest), shared: usableShared(shared, providers).map(listedShared), verifiers: Boolean(verifications) })
      }),

      addMailSender: createAuthEndpoint(
        mailSenderPaths.add,
        { method: 'POST', use: [sessionMiddleware], body: z.object({ address: senderAddressInput, name: nameField.optional(), signature: signatureField.optional(), connection: idField.optional() }) },
        async (ctx) => {
          const { userId, store, book } = await bookOf(ctx, providers, verifications)
          const { address, name = null, signature = null, connection } = ctx.body
          // Only a connection of the person's own: another's, or one that cannot send, is not found.
          const chosen = connection === undefined ? linkedMailbox(book.connections.map(({ account }) => account), providers) : book.connections.find(({ account }) => account.id === connection)
          if (!chosen) throw new APIError(connection === undefined ? 'BAD_REQUEST' : 'NOT_FOUND', noMailbox)
          const live = book.rows.filter((row) => !isRemoved(row))
          if (live.length >= maxSenders) throw new APIError('BAD_REQUEST', tooMany)
          if (live.some((row) => row.connectionId === chosen.account.id && row.address === address && row.typedAt !== null)) throw new APIError('BAD_REQUEST', taken)
          // Never shared: sharing an address with others waits until the person can prove it is theirs.
          const row = await store.type({ userId, connectionId: chosen.account.id, address, name, signature }, new Date())
          return ctx.json({ sender: listedSender({ ...book, rows: [row] }, row)! })
        },
      ),

      updateMailSender: createAuthEndpoint(
        mailSenderPaths.update,
        { method: 'POST', use: [sessionMiddleware], body: z.object({ id: idField, name: nameField.nullable().optional(), signature: signatureField.nullable().optional(), isDefault: z.boolean().optional() }) },
        async (ctx) => {
          const { userId, store, book } = await bookOf(ctx, providers, verifications)
          const { id, isDefault, ...update } = ctx.body
          ownRow(book.rows, id)
          // One default at most: the old one gives way first, as the store's unique index on it requires.
          if (isDefault === true) await store.clearDefault(userId)
          const row = await store.change(userId, id, { ...update, ...(isDefault !== undefined && { isDefault }) })
          if (!row) throw new APIError('NOT_FOUND', notFound)
          return ctx.json({ sender: listedSender(book, row)! })
        },
      ),

      removeMailSender: createAuthEndpoint(mailSenderPaths.remove, { method: 'POST', use: [sessionMiddleware], body: z.object({ id: idField }) }, async (ctx) => {
        const { userId, store, book } = await bookOf(ctx, providers)
        const row = ownRow(book.rows, ctx.body.id)
        if (inUse) await inUse.refuse(row.address, headersLocale(ctx.headers))
        await store.remove(userId, ctx.body.id, new Date())
        return ctx.json({ removed: true })
      }),

      refreshMailSenders: createAuthEndpoint(mailSenderPaths.refresh, { method: 'POST', use: [sessionMiddleware] }, async (ctx) => {
        const connections = await mailOf(ctx.context.session.user.id).refresh()
        return ctx.json({ connections })
      }),

      shareMailSender: createAuthEndpoint(mailSenderPaths.share, { method: 'POST', use: [sessionMiddleware], body: z.object({ id: idField }) }, async (ctx) => {
        const { userId, store, book } = await bookOf(ctx, providers, verifications)
        const row = ownRow(book.rows, ctx.body.id)
        // The same state the list shows, read now: a share records no proof of its own.
        if (stateIn(book, row) !== 'verified') throw new APIError('CONFLICT', notVerified)
        const shared = await store.share(userId, row.id, new Date())
        if (!shared) throw new APIError('NOT_FOUND', notFound)
        return ctx.json({ sender: listedSender(book, shared)! })
      }),

      unshareMailSender: createAuthEndpoint(mailSenderPaths.unshare, { method: 'POST', use: [sessionMiddleware], body: z.object({ id: idField }) }, async (ctx) => {
        const { userId, store, book } = await bookOf(ctx, providers, verifications)
        ownRow(book.rows, ctx.body.id)
        const row = await store.share(userId, ctx.body.id, null)
        if (!row) throw new APIError('NOT_FOUND', notFound)
        return ctx.json({ sender: listedSender(book, row)! })
      }),

      ...(verifications && {
        verifyMailSender: createAuthEndpoint(mailSenderPaths.verify, { method: 'POST', use: [sessionMiddleware], body: z.object({ id: idField }) }, async (ctx) => {
          const { userId, book } = await bookOf(ctx, providers, verifications)
          const row = ownRow(book.rows, ctx.body.id)
          // Its test message goes through the connection it is on: one the person cannot send through has none.
          if (stateIn(book, row) === 'detached') throw new APIError('NOT_FOUND', notFound)
          await verifications.start(userId, { id: row.id, address: row.address, name: row.name }, headersLocale(ctx.headers))
          const latest = await verifications.latestOf(userId)
          return ctx.json({ verifications: latest.filter(({ senderId }) => senderId === row.id).map(listedVerification) })
        }),
        reportMailSenderVerification: reportEndpoint(verifications),
      }),
    },
  }) satisfies BetterAuthPlugin
