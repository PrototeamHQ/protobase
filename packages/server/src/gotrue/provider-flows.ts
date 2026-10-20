import { generateRandomString } from 'better-auth/crypto'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AuthContext } from '../better-auth/organizations/store'
import { hashOf } from '../better-auth/sign-up/sign-up-code'
import type { CodeChallenge } from './auth-codes'
import { goTruePath } from './keys'

// A sign-in with a provider that `/authorize` started: where it goes back to, its PKCE challenge, the browser's session
// before it, if any, and the hash of its hand-off secret. Kept in Better Auth's verification table under the hash of a
// random id that only the browser that started it holds, in a cookie sent to `/callback` alone; for ten minutes and
// once. The hand-off secret travels only in the `callbackURL` of Better Auth's success redirect, which Better Auth keeps
// in its own state row and follows only once the provider signed the user in for that state; so a secret that matches
// proves the request is the end of the flow's own provider sign-in, and not a password, passkey or emailed-code sign-in
// that happens to come after an abandoned flow. `/callback` hands a code or a session out only then.

export type ProviderFlow = { redirectTo: string; challenge?: CodeChallenge; sessionBefore?: string; handOff: string }

const flowSeconds = 10 * 60

// Better Auth's cookie name and attributes, so its prefix and `Secure` follow the app's settings, not the request.
const flowCookie = (context: AuthContext) => context.createAuthCookie('gotrue_flow', { maxAge: flowSeconds, path: `${goTruePath}/callback` })

const identifierOf = async (id: string) => `gotrue-provider-flow-${await hashOf(id)}`

/** Keeps `flow` and gives the browser its id; answers the flow's hand-off secret. */
export const startFlow = async (c: Context, context: AuthContext, flow: Omit<ProviderFlow, 'handOff'>) => {
  const id = generateRandomString(32)
  const secret = generateRandomString(32)
  const stored: ProviderFlow = { ...flow, handOff: await hashOf(secret) }
  await context.internalAdapter.createVerificationValue({ identifier: await identifierOf(id), value: JSON.stringify(stored), expiresAt: new Date(Date.now() + flowSeconds * 1000) })
  const { name, attributes } = flowCookie(context)
  setCookie(c, name, id, attributes)
  return secret
}

/** Takes the flow of the browser's cookie, so it works once, and clears the cookie; nothing when there is none. */
export const takeFlow = async (c: Context, context: AuthContext): Promise<ProviderFlow | undefined> => {
  const { name, attributes } = flowCookie(context)
  const id = getCookie(c, name)
  if (!id) return undefined
  deleteCookie(c, name, attributes)
  const consumed = await context.internalAdapter.consumeVerificationValue(await identifierOf(id))
  if (!consumed || new Date(consumed.expiresAt) < new Date()) return undefined
  return JSON.parse(consumed.value) as ProviderFlow
}

/** Whether `secret` is the flow's hand-off secret. */
export const isHandOff = async (flow: ProviderFlow, secret: string | undefined) => !!secret && (await hashOf(secret)) === flow.handOff
