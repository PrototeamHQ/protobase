import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import { decodeJwt } from 'jose'
import * as z from 'zod'
import type { AuthContext } from './organizations/store'
import type { SignInRefusal } from './sign-in-enforcement'
import { isStaffSession } from './staff-checks'

/** The claim of a device provider's ID token that names the device, such as "Sanne's phone", shown on the account page. */
export const deviceNameClaim = 'device_name'

/** Better Auth's model for the device accounts people signed out of: one row per provider and subject. */
export const refusedAccountModel = 'refusedAccount'

export const refusedAccountSchema = {
  [refusedAccountModel]: {
    modelName: 'refused_account',
    fields: {
      providerId: { type: 'string', required: true, fieldName: 'provider_id' },
      accountId: { type: 'string', required: true, fieldName: 'account_id' },
      userId: { type: 'string', required: true, fieldName: 'user_id' },
      createdAt: { type: 'date', required: true, fieldName: 'created_at' },
    },
  },
} as const

export const deviceSignedOut: SignInRefusal = { code: 'DEVICE_SIGNED_OUT', message: 'This device was signed out of the account; it cannot sign in again.' }

const deviceLinkNotFound: SignInRefusal = { code: 'DEVICE_LINK_NOT_FOUND', message: 'No device of yours is linked with that id.' }

type Stores = Pick<AuthContext, 'adapter' | 'internalAdapter'>

// Kept in Better Auth's verification table, like the note of a token session, until the session ends.
const sessionIdentifier = (sessionId: string) => `protobase-device-session-${sessionId}`

/** Whether the person signed the device with `accountId` at `providerId` out: it never signs in or links again. */
export const isRefusedAccount = async ({ adapter }: Pick<Stores, 'adapter'>, providerId: string, accountId: string) =>
  (await adapter.count({ model: refusedAccountModel, where: [{ field: 'providerId', value: providerId }, { field: 'accountId', value: accountId }] })) > 0

/** Notes that the session began with the device account `accountRowId`, so signing the device out ends it. */
export const saveDeviceSession = async ({ internalAdapter }: Pick<Stores, 'internalAdapter'>, session: { id: string; expiresAt: Date }, accountRowId: string) => {
  await internalAdapter.createVerificationValue({ identifier: sessionIdentifier(session.id), value: accountRowId, expiresAt: session.expiresAt })
}

type Account = { id: string; providerId: string; accountId: string; idToken?: string | null; createdAt: Date }
type Session = { id: string; token: string }

/** The name the device's last ID token gave it, if any. */
export const deviceNameOf = (idToken: string | null | undefined) => {
  if (!idToken) return
  try {
    const name = decodeJwt(idToken)[deviceNameClaim]
    return typeof name === 'string' && name.trim() ? name.trim() : undefined
  } catch {
    return
  }
}

// The person's device accounts, each with the tokens of the sessions it began, in one read of the session notes.
const deviceLinks = async ({ adapter, internalAdapter }: Stores, userId: string, providers: { provider: string; name: string }[]) => {
  const accounts = ((await internalAdapter.findAccounts(userId)) as Account[]).filter(({ providerId }) => providers.some(({ provider }) => provider === providerId))
  const sessions = (await internalAdapter.listSessions(userId)) as Session[]
  const notes = sessions.length === 0 ? [] : await adapter.findMany<{ identifier: string; value: string }>({ model: 'verification', where: [{ field: 'identifier', operator: 'in', value: sessions.map(({ id }) => sessionIdentifier(id)) }] })
  const sessionsOf = (account: Account) => sessions.filter(({ id }) => notes.some(({ identifier, value }) => identifier === sessionIdentifier(id) && value === account.id))
  return accounts.map((account) => ({ account, sessions: sessionsOf(account) }))
}

/**
 * The person's device accounts of the platform's device `providers` (`PlatformSignIn.devices`), for the account page's
 * devices: `GET /account/device-links` lists each with its provider's name, the device's name from its last ID token
 * (`device_name`) and the tokens of the sessions it began; `POST /account/device-links/sign-out` with its `id` signs
 * the device out: its subject is refused from then on (`isRefusedAccount`), its account removed and its sessions ended.
 * A staff session can do neither.
 */
export const deviceLinksPlugin = (providers: { provider: string; name: string }[]) =>
  ({
    id: 'protobase-device-links',
    schema: refusedAccountSchema,
    endpoints: {
      listDeviceLinks: createAuthEndpoint('/account/device-links', { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
        if (isStaffSession(ctx.context.session.session)) return ctx.json({ links: [] })
        const links = await deviceLinks(ctx.context, ctx.context.session.user.id, providers)
        return ctx.json({
          links: links.map(({ account, sessions }) => {
            const device = deviceNameOf(account.idToken)
            return {
              id: account.id,
              provider: account.providerId,
              name: providers.find(({ provider }) => provider === account.providerId)!.name,
              ...(device && { device }),
              linkedAt: new Date(account.createdAt).toISOString(),
              sessions: sessions.map(({ token }) => token),
            }
          }),
        })
      }),

      signOutDeviceLink: createAuthEndpoint('/account/device-links/sign-out', { method: 'POST', use: [sessionMiddleware], body: z.object({ id: z.string() }) }, async (ctx) => {
        if (isStaffSession(ctx.context.session.session)) throw new APIError('FORBIDDEN', { code: 'STAFF_SESSION', message: 'A staff session cannot sign out the devices of the person.' })
        const userId = ctx.context.session.user.id
        const link = (await deviceLinks(ctx.context, userId, providers)).find(({ account }) => account.id === ctx.body.id)
        if (!link) throw new APIError('NOT_FOUND', deviceLinkNotFound)
        const { account, sessions } = link
        // Refused first, so a sign-in with the device's token at the same time cannot link it again.
        await ctx.context.adapter.create({ model: refusedAccountModel, data: { providerId: account.providerId, accountId: account.accountId, userId, createdAt: new Date() } })
        await ctx.context.internalAdapter.deleteAccount(account.id)
        for (const session of sessions) {
          await ctx.context.internalAdapter.deleteSession(session.token)
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(sessionIdentifier(session.id))
        }
        return ctx.json({ signedOut: true })
      }),
    },
  }) satisfies BetterAuthPlugin
