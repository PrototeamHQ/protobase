import { passkey, PASSKEY_ERROR_CODES } from '@better-auth/passkey'
import { generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticationResponseJSON } from '@simplewebauthn/server'
import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, getSessionFromCtx } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { generateRandomString } from 'better-auth/crypto'
import * as z from 'zod'
import { pluginNames } from './snake-case-names'

export type PasskeyPluginOptions = {
  /** The RP ID of new passkeys (see `resolvePasskeyDomain`). */
  domain: string
  /** Every RP ID a passkey of the app can have: the host names of its origins. */
  hosts: string[]
  /** The RP ID of a passkey made before passkeys kept theirs: the host of `baseURL`, which they all had then. */
  formerDomain: string
}

type StoredPasskey = { id: string; userId: string; credentialID: string; publicKey: string; counter: number; transports?: string | null; rpID?: string | null }

// The passkey plugin's own names, so its registration and these endpoints share the challenge.
const challengeCookie = 'better-auth-passkey'
const challengeSeconds = 300

const unknownDomain = { code: 'UNKNOWN_PASSKEY_DOMAIN', message: 'This app has no passkeys for that domain.' }

const decodeBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))

/**
 * Better Auth's passkeys, with an RP ID kept per passkey. New passkeys are made for the passkey domain; each keeps the
 * RP ID it was made with, so changing the passkey domain breaks none. A sign-in asks the browser for passkeys of one RP
 * ID, `?rpId=` or the passkey domain, and checks the passkey it gets against its own. On an app with several origins,
 * browsers let each origin use the passkeys of the others through `/.well-known/webauthn` (Related Origin Requests).
 */
export const passkeyPlugin = ({ domain, hosts, formerDomain }: PasskeyPluginOptions) => {
  const base = passkey({ schema: pluginNames.passkey, rpID: domain })
  const rpIDOf = (stored: StoredPasskey) => stored.rpID ?? formerDomain

  /** `GET /passkey/generate-authenticate-options?rpId=`: what the browser needs to ask for a passkey of that RP ID. */
  const generatePasskeyAuthenticationOptions = createAuthEndpoint(
    '/passkey/generate-authenticate-options',
    { method: 'GET', query: z.object({ rpId: z.string().optional() }).optional() },
    async (ctx) => {
      const rpID = ctx.query?.rpId?.toLowerCase() ?? domain
      if (!hosts.includes(rpID)) throw new APIError('BAD_REQUEST', unknownDomain)
      const session = await getSessionFromCtx(ctx)
      const own = session ? await ctx.context.adapter.findMany<StoredPasskey>({ model: 'passkey', where: [{ field: 'userId', value: session.user.id }] }) : []
      const passkeys = own.filter((stored) => rpIDOf(stored) === rpID)
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'preferred',
        ...(passkeys.length > 0 && { allowCredentials: passkeys.map((stored) => ({ id: stored.credentialID, ...(stored.transports && { transports: stored.transports.split(',') as never }) })) }),
      })
      const token = generateRandomString(32)
      const cookie = ctx.context.createAuthCookie(challengeCookie)
      await ctx.setSignedCookie(cookie.name, token, ctx.context.secret, { ...cookie.attributes, maxAge: challengeSeconds })
      await ctx.context.internalAdapter.createVerificationValue({
        identifier: token,
        value: JSON.stringify({ type: 'authentication', expectedChallenge: options.challenge, userData: { id: session?.user.id ?? '' } }),
        expiresAt: new Date(Date.now() + challengeSeconds * 1000),
      })
      return ctx.json(options)
    },
  )

  /** `POST /passkey/verify-authentication`: checks the browser's answer against the passkey's own RP ID and signs in. */
  const verifyPasskeyAuthentication = createAuthEndpoint(
    '/passkey/verify-authentication',
    { method: 'POST', body: z.object({ response: z.record(z.any(), z.any()) }) },
    async (ctx) => {
      const origin = ctx.headers?.get('origin')
      if (!origin) throw new APIError('BAD_REQUEST', { message: 'origin missing' })
      const response = ctx.body.response as unknown as AuthenticationResponseJSON
      const cookie = ctx.context.createAuthCookie(challengeCookie)
      const token = await ctx.getSignedCookie(cookie.name, ctx.context.secret)
      if (!token) throw new APIError('BAD_REQUEST', PASSKEY_ERROR_CODES.CHALLENGE_NOT_FOUND)
      const challenge = await ctx.context.internalAdapter.consumeVerificationValue(token)
      if (!challenge) throw new APIError('BAD_REQUEST', PASSKEY_ERROR_CODES.CHALLENGE_NOT_FOUND)
      const { type, expectedChallenge } = JSON.parse(challenge.value) as { type: string; expectedChallenge: string }
      if (type !== 'authentication') throw new APIError('BAD_REQUEST', PASSKEY_ERROR_CODES.CHALLENGE_NOT_FOUND)
      const stored = await ctx.context.adapter.findOne<StoredPasskey>({ model: 'passkey', where: [{ field: 'credentialID', value: response.id }] })
      if (!stored) throw new APIError('UNAUTHORIZED', PASSKEY_ERROR_CODES.PASSKEY_NOT_FOUND)

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpIDOf(stored),
        credential: { id: stored.credentialID, publicKey: decodeBase64(stored.publicKey), counter: stored.counter, ...(stored.transports && { transports: stored.transports.split(',') as never }) },
        requireUserVerification: false,
      }).catch((error: unknown) => {
        // An answer that does not match (origin, RP ID, challenge or signature) is a failed sign-in, not a server error.
        ctx.context.logger.error('Failed to verify the passkey', error)
        return undefined
      })
      if (!verification?.verified) throw new APIError('UNAUTHORIZED', PASSKEY_ERROR_CODES.AUTHENTICATION_FAILED)

      await ctx.context.adapter.update({ model: 'passkey', where: [{ field: 'id', value: stored.id }], update: { counter: verification.authenticationInfo.newCounter } })
      const session = await ctx.context.internalAdapter.createSession(stored.userId)
      if (!session) throw new APIError('INTERNAL_SERVER_ERROR', PASSKEY_ERROR_CODES.UNABLE_TO_CREATE_SESSION)
      const user = await ctx.context.internalAdapter.findUserById(stored.userId)
      if (!user) throw new APIError('INTERNAL_SERVER_ERROR', PASSKEY_ERROR_CODES.USER_NOT_FOUND)
      await setSessionCookie(ctx, { session, user })
      return ctx.json({ session, user })
    },
  )

  return {
    ...base,
    endpoints: { ...base.endpoints, generatePasskeyAuthenticationOptions, verifyPasskeyAuthentication },
    // A new passkey keeps the passkey domain it was made for. A copy, since the plugin's schema is shared by every instance.
    schema: {
      passkey: { ...base.schema.passkey, fields: { ...base.schema.passkey.fields, rpID: { type: 'string', required: false, fieldName: 'rp_id', input: false, defaultValue: () => domain } } },
    },
  } satisfies BetterAuthPlugin
}
