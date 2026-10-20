import { generateRandomString } from 'better-auth/crypto'
import type { AuthContext } from '../better-auth/organizations/store'
import { hashOf } from '../better-auth/sign-up/sign-up-code'
import { GoTrueError } from './errors'

// The code a sign-in with a provider hands back to the app, which trades it with its PKCE verifier for a session
// (`grant_type=pkce`). Kept in Better Auth's verification table under its hash, with the user and the challenge, for
// five minutes and once.

export type CodeChallenge = { challenge: string; method: 's256' | 'plain' }

const codeSeconds = 5 * 60

const identifierOf = async (code: string) => `gotrue-auth-code-${await hashOf(code)}`

const base64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

/** Whether `verifier` is the one `challenge` was made from: its SHA-256 in base64url for `s256`, itself for `plain`. */
export const matchesChallenge = async (verifier: string, { challenge, method }: CodeChallenge) =>
  method === 'plain' ? verifier === challenge : base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))) === challenge

/** A new code that signs in `userId` for whoever holds the verifier of `challenge`. */
export const issueAuthCode = async (context: AuthContext, userId: string, challenge: CodeChallenge) => {
  const code = generateRandomString(32)
  await context.internalAdapter.createVerificationValue({ identifier: await identifierOf(code), value: JSON.stringify({ userId, ...challenge }), expiresAt: new Date(Date.now() + codeSeconds * 1000) })
  return code
}

const invalidGrant = () => new GoTrueError(400, 'flow_state_not_found', 'invalid flow state, no valid flow state found')

/** Takes `code`, so it works once, and answers its user when `verifier` matches its challenge. */
export const takeAuthCode = async (context: AuthContext, code: string, verifier: string) => {
  const consumed = await context.internalAdapter.consumeVerificationValue(await identifierOf(code))
  if (!consumed || new Date(consumed.expiresAt) < new Date()) throw invalidGrant()
  const { userId, ...challenge } = JSON.parse(consumed.value) as CodeChallenge & { userId: string }
  if (!(await matchesChallenge(verifier, challenge))) throw new GoTrueError(400, 'bad_code_verifier', 'code challenge does not match previously saved code verifier')
  return userId
}
