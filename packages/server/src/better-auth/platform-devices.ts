import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware, sessionMiddleware } from 'better-auth/api'
import { decodeJwt } from 'jose'
import * as z from 'zod'
import { everyRow, type AuthContext } from './organizations/store'
import type { SignInRefusal } from './sign-in-enforcement'
import { isStaffSession } from './staff-checks'

/** The claim of a device provider's ID token that names the device, such as "Sanne's phone", shown on the account page. */
export const deviceNameClaim = 'device_name'

/** Better Auth's model for the device accounts people signed out of: one row per provider and subject. */
export const refusedAccountModel = 'refusedAccount'

/** Better Auth's model for the sessions a device account began: one row per session, which goes with the session. */
export const deviceSessionModel = 'deviceSession'

export const devicesSchema = {
  [refusedAccountModel]: {
    modelName: 'refused_account',
    fields: {
      providerId: { type: 'string', required: true, fieldName: 'provider_id' },
      accountId: { type: 'string', required: true, fieldName: 'account_id' },
      userId: { type: 'string', required: true, fieldName: 'user_id' },
      createdAt: { type: 'date', required: true, fieldName: 'created_at' },
    },
  },
  [deviceSessionModel]: {
    modelName: 'device_session',
    fields: {
      sessionId: { type: 'string', required: true, fieldName: 'session_id' },
      accountId: { type: 'string', required: true, fieldName: 'account_id' },
      createdAt: { type: 'date', required: true, fieldName: 'created_at' },
    },
  },
} as const

export const deviceSignedOut: SignInRefusal = { code: 'DEVICE_SIGNED_OUT', message: 'This device was signed out of the account; it cannot sign in again.' }

export const deviceLinkNotFound: SignInRefusal = { code: 'DEVICE_LINK_NOT_FOUND', message: 'No device of yours is linked with that id.' }

const staffCannotSignOut: SignInRefusal = { code: 'STAFF_SESSION', message: 'A staff session cannot sign out the devices of the person.' }

type Stores = Pick<AuthContext, 'adapter' | 'internalAdapter'>

/** Whether the person signed the device with `accountId` at `providerId` out: it never signs in or links again. */
export const isRefusedAccount = async ({ adapter }: Pick<Stores, 'adapter'>, providerId: string, accountId: string) =>
  (await adapter.count({ model: refusedAccountModel, where: [{ field: 'providerId', value: providerId }, { field: 'accountId', value: accountId }] })) > 0

/**
 * Notes that `session` began with the device `subject` of `providerId`, then checks the device is not signed out: a
 * sign-out between the sign-in's own check and now ends the session at once and answers `403 DEVICE_SIGNED_OUT`. As a
 * sign-out refuses the device before it reads the device's sessions, every session of a signed-out device ends.
 */
export const saveDeviceSession = async (stores: Stores, session: { id: string; token: string }, providerId: string, subject: string) => {
  const account = await stores.internalAdapter.findAccountByKey({ providerId, accountId: subject })
  if (account) await stores.adapter.create({ model: deviceSessionModel, data: { sessionId: session.id, accountId: account.id, createdAt: new Date() } })
  if (!account || (await isRefusedAccount(stores, providerId, subject))) {
    await stores.internalAdapter.deleteSession(session.token)
    throw new APIError('FORBIDDEN', deviceSignedOut)
  }
}

// A device sign-in that waits for the second step, by the identifier of its two-factor cookie, until the step is taken.
const pendingIdentifier = (twoFactorIdentifier: string) => `protobase-device-second-step-${twoFactorIdentifier}`

/** Notes that the sign-in waiting for its second step under `twoFactorIdentifier` is the device `subject` of `providerId`. */
export const savePendingDevice = async ({ internalAdapter }: Pick<Stores, 'internalAdapter'>, twoFactorIdentifier: string, device: { providerId: string; subject: string }, expiresAt: Date) => {
  await internalAdapter.createVerificationValue({ identifier: pendingIdentifier(twoFactorIdentifier), value: JSON.stringify(device), expiresAt })
}

/** The device the sign-in waiting under `twoFactorIdentifier` began with, if any, which the note then forgets. */
export const takePendingDevice = async ({ internalAdapter }: Pick<Stores, 'internalAdapter'>, twoFactorIdentifier: string) => {
  const note = await internalAdapter.findVerificationValue(pendingIdentifier(twoFactorIdentifier))
  if (!note) return
  await internalAdapter.deleteVerificationByIdentifier(pendingIdentifier(twoFactorIdentifier))
  return JSON.parse(note.value) as { providerId: string; subject: string }
}

// The two-factor plugin's cookie, which names the sign-in waiting for its second step, and how long it lasts by default.
const twoFactorCookie = 'two_factor'
const secondStepSeconds = 600
// The endpoints that take the second step and start the session it was waiting for.
const secondStepPaths = ['/two-factor/verify-totp', '/two-factor/verify-otp', '/two-factor/verify-backup-code']

// The identifier of the two-factor cookie an answer sets, its signed value being `<identifier>.<signature>`.
const setTwoFactorIdentifier = (headers: Headers | null | undefined, name: string) => {
  const line = headers?.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`))
  const value = line && decodeURIComponent(line.slice(name.length + 1).split(';')[0]!)
  return value ? value.slice(0, value.lastIndexOf('.')) || undefined : undefined
}

// The device a token sign-in posted for one of `providers`, by its subject: the token was verified before Better Auth
// signed in with it (`idTokenSignInPlugin`).
const postedDevice = (path: string | undefined, body: unknown, providers: string[]) => {
  const { provider, idToken } = (body ?? {}) as { provider?: unknown; idToken?: { token?: unknown } }
  if (path !== '/sign-in/social' || !providers.includes(provider as string) || typeof idToken?.token !== 'string') return
  const { sub } = decodeJwt(idToken.token)
  return typeof sub === 'string' ? { providerId: provider as string, subject: sub } : undefined
}

type Account = { id: string; providerId: string; accountId: string; idToken?: string | null; createdAt: Date }
type Session = { id: string; token: string }

/** Every account of the person, however many: Better Auth's own read stops at 100. */
export const accountsOf = async ({ adapter }: Pick<Stores, 'adapter'>, userId: string) =>
  adapter.findMany<Account>({ model: 'account', where: [{ field: 'userId', value: userId }], limit: everyRow })

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

// The person's device accounts, each with every session it began: three reads, each of every row it matches.
const deviceLinks = async ({ adapter }: Pick<Stores, 'adapter'>, userId: string, providers: { provider: string; name: string }[]) => {
  const accounts = (await accountsOf({ adapter }, userId)).filter(({ providerId }) => providers.some(({ provider }) => provider === providerId))
  if (accounts.length === 0) return []
  const began = await adapter.findMany<{ sessionId: string; accountId: string }>({ model: deviceSessionModel, where: [{ field: 'accountId', operator: 'in', value: accounts.map(({ id }) => id) }], limit: everyRow })
  const sessions = began.length === 0 ? [] : await adapter.findMany<Session>({ model: 'session', where: [{ field: 'id', operator: 'in', value: began.map(({ sessionId }) => sessionId) }], limit: everyRow })
  const sessionsOf = (account: Account) => sessions.filter(({ id }) => began.some((row) => row.sessionId === id && row.accountId === account.id))
  return accounts.map((account) => ({ account, sessions: sessionsOf(account) }))
}

/**
 * The person's device accounts of the platform's device `providers` (`PlatformSignIn.devices`), for the account page's
 * devices: `GET /account/device-links` lists each with its provider's name, the device's name from its last ID token
 * (`device_name`) and the tokens of the sessions it began; `POST /account/device-links/sign-out` with its `id` signs
 * the device out: its subject is refused from then on (`isRefusedAccount`), its sessions end, and its account goes,
 * last, so a sign-out that failed half way is taken again. A staff session can do neither. Every session a device's token
 * sign-in starts is noted as the device's (`saveDeviceSession`), also when it starts only once the second step is taken.
 * After the two-factor plugin, so a sign-in it holds for the second step has no session yet.
 */
export const deviceLinksPlugin = (providers: { provider: string; name: string }[]) =>
  ({
    id: 'protobase-device-links',
    schema: devicesSchema,
    hooks: {
      after: [
        {
          matcher: (context) => context.path === '/sign-in/social' || (context.path !== undefined && secondStepPaths.includes(context.path)),
          handler: createAuthMiddleware(async (ctx) => {
            const cookieName = ctx.context.createAuthCookie(twoFactorCookie).name
            const session = ctx.context.newSession?.session
            if (ctx.path !== '/sign-in/social') {
              const identifier = session && (await ctx.getSignedCookie(cookieName, ctx.context.secret))
              const device = identifier ? await takePendingDevice(ctx.context, identifier) : undefined
              if (device) await saveDeviceSession(ctx.context, session!, device.providerId, device.subject)
              return
            }
            const device = postedDevice(ctx.path, ctx.body, providers.map(({ provider }) => provider))
            if (!device) return
            if (session) return saveDeviceSession(ctx.context, session, device.providerId, device.subject)
            const identifier = setTwoFactorIdentifier(ctx.context.responseHeaders, cookieName)
            if (identifier) await savePendingDevice(ctx.context, identifier, device, new Date(Date.now() + secondStepSeconds * 1000))
          }),
        },
      ],
    },
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
        if (isStaffSession(ctx.context.session.session)) throw new APIError('FORBIDDEN', staffCannotSignOut)
        const userId = ctx.context.session.user.id
        const account = (await accountsOf(ctx.context, userId)).find(({ id, providerId }) => id === ctx.body.id && providers.some(({ provider }) => provider === providerId))
        if (!account) throw new APIError('NOT_FOUND', deviceLinkNotFound)
        // Refused first, so a sign-in with the device's token at the same time ends its own session (`saveDeviceSession`).
        if (!(await isRefusedAccount(ctx.context, account.providerId, account.accountId))) {
          // A sign-out of the same device at the same time refuses it too: either one's row will do.
          await ctx.context.adapter.create({ model: refusedAccountModel, data: { providerId: account.providerId, accountId: account.accountId, userId, createdAt: new Date() } }).catch(async (error: unknown) => {
            if (!(await isRefusedAccount(ctx.context, account.providerId, account.accountId))) throw error
          })
        }
        const [link] = await deviceLinks(ctx.context, userId, providers.filter(({ provider }) => provider === account.providerId)).then((links) => links.filter((found) => found.account.id === account.id))
        for (const session of link?.sessions ?? []) await ctx.context.internalAdapter.deleteSession(session.token)
        await ctx.context.internalAdapter.deleteAccount(account.id)
        return ctx.json({ signedOut: true })
      }),
    },
  }) satisfies BetterAuthPlugin
