import { Hono } from 'hono'
import * as z from 'zod'
import { checkNewAccountPassword } from '../better-auth/new-account-password'
import { readSignInPolicy } from '../better-auth/policy-store'
import { effectiveSignInPolicy } from '../better-auth/sign-in-policy'
import { createSignedUpAccount } from '../better-auth/sign-up/sign-up-account'
import { consumeSignUpTicket } from '../better-auth/sign-up/sign-up-ticket'
import type { GoTrueDeps } from './deps'
import { GoTrueError } from './errors'
import { callBetterAuth, signedInToken } from './forward'
import { hasPendingSignUp, savePendingSignUp, takePendingSignUp } from './pending-sign-up'
import { address, readBody } from './request-body'

// Every address is proved with a code mailed to it, never a link: `verify` takes the code. Signing up keeps what was
// given until then (`pending-sign-up.ts`); signing in, by code or after a lost password, is Better Auth's emailed code.

const metadata = z.record(z.string(), z.unknown()).default({})
const signUpBody = z.object({ email: address, password: z.string(), data: metadata })
const otpBody = z.object({ email: address, create_user: z.boolean().default(true), data: metadata })
const verifyBody = z.object({ email: address.optional(), token: z.string().trim().optional(), token_hash: z.string().optional(), type: z.string() })
const emailBody = z.object({ email: address })
const resendBody = z.object({ email: address, type: z.string() })

const signUpDisabled = () => new GoTrueError(422, 'signup_disabled', 'Signups not allowed for this instance')

// The name Better Auth needs: the one the metadata gives, else the address's local part, as for an account made on the host.
const nameOf = (email: string, data: Record<string, unknown>) => {
  const given = data.name ?? data.full_name
  return typeof given === 'string' && given.trim() ? given.trim() : email.split('@')[0]!
}

export const emailCodeRoutes = ({ auth, context, sessionOf }: GoTrueDeps) => {
  const checkMetadata = (data: Record<string, unknown>) => {
    if (Object.keys(data).length > 0 && !auth.userMetadata) throw new GoTrueError(400, 'validation_failed', 'This app keeps no user metadata: leave data out')
  }

  const signUpPolicy = async () => effectiveSignInPolicy((await readSignInPolicy((await context()).adapter, auth.signInPolicy)).policy, { mail: true })

  // Mails the sign-up code, or tells an address with an account so, through Better Auth's own endpoint and its rate limit.
  const sendSignUpCode = (request: Request, email: string) => callBetterAuth(auth, request, '/sign-up/send-code', { email })

  const sendSignInCode = (request: Request, email: string) => callBetterAuth(auth, request, '/email-otp/send-verification-otp', { email, type: 'sign-in' })

  const signInWithCode = async (request: Request, email: string, code: string) => {
    const { json } = await callBetterAuth(auth, request, '/sign-in/email-otp', { email, otp: code })
    return sessionOf(signedInToken(json))
  }

  // The right code makes the account with what the sign-up gave, and signs it in.
  const signUpWithCode = async (request: Request, email: string, code: string) => {
    const ctx = await context()
    if (!auth.signUpRole || !(await hasPendingSignUp(ctx, email))) throw new GoTrueError(403, 'otp_expired', 'Token has expired or is invalid')
    const { json } = await callBetterAuth(auth, request, '/sign-up/verify-code', { email, code })
    await consumeSignUpTicket(ctx, String(json.ticket))
    const pending = await takePendingSignUp(ctx, email)
    if (!pending) throw new GoTrueError(403, 'otp_expired', 'Token has expired or is invalid')
    const { passwordHash, metadata } = pending
    const user = await createSignedUpAccount(ctx, {
      email,
      name: nameOf(email, metadata),
      role: auth.signUpRole,
      ...(passwordHash !== undefined && { passwordHash }),
      ...(Object.keys(metadata).length > 0 && { metadata }),
    })
    return sessionOf((await ctx.internalAdapter.createSession(user.id)).token)
  }

  return (
    new Hono()
      /** `POST /signup`: mails a code to prove the address; `verify` with it makes the account. No session until then. */
      .post('/signup', async (c) => {
        const { email, password, data } = await readBody(c.req.raw, signUpBody)
        if (!auth.signUp) throw signUpDisabled()
        checkMetadata(data)
        checkNewAccountPassword(await signUpPolicy(), password)
        await sendSignUpCode(c.req.raw, email)
        await savePendingSignUp(await context(), email, { passwordHash: await (await context()).password.hash(password), metadata: data })
        return c.json({})
      })
      /** `POST /otp`: mails a sign-in code; to an address without an account, a sign-up code when sign-up is open and asked for. */
      .post('/otp', async (c) => {
        const { email, create_user, data } = await readBody(c.req.raw, otpBody)
        const signsUp = create_user && auth.signUp && !(await (await context()).internalAdapter.findUserByEmail(email))
        if (!signsUp) {
          await sendSignInCode(c.req.raw, email)
          return c.json({})
        }
        checkMetadata(data)
        checkNewAccountPassword(await signUpPolicy(), undefined)
        await sendSignUpCode(c.req.raw, email)
        await savePendingSignUp(await context(), email, { metadata: data })
        return c.json({})
      })
      /** `POST /verify`: a mailed code with its address, which signs in, or makes the account of a sign-up. */
      .post('/verify', async (c) => {
        const { email, token, token_hash, type } = await readBody(c.req.raw, verifyBody)
        if (token_hash !== undefined || email === undefined || !token) {
          throw new GoTrueError(400, 'validation_failed', 'Send the email address and the code mailed to it: links are not offered')
        }
        if (type === 'signup') return c.json(await signUpWithCode(c.req.raw, email, token))
        if (type === 'recovery') return c.json(await signInWithCode(c.req.raw, email, token))
        if (type === 'email' || type === 'magiclink') {
          const known = await (await context()).internalAdapter.findUserByEmail(email)
          return c.json(await (known ? signInWithCode(c.req.raw, email, token) : signUpWithCode(c.req.raw, email, token)))
        }
        throw new GoTrueError(400, 'validation_failed', `Verify type ${type} is not offered: use email, signup or recovery`)
      })
      /** `POST /recover`: mails a sign-in code; signed in with it, the user sets a new password with `PUT /user`. */
      .post('/recover', async (c) => {
        const { email } = await readBody(c.req.raw, emailBody)
        await sendSignInCode(c.req.raw, email)
        return c.json({})
      })
      /** `POST /resend` with `type: 'signup'`: mails a new code for a sign-up that waits for one. */
      .post('/resend', async (c) => {
        const { email, type } = await readBody(c.req.raw, resendBody)
        if (type !== 'signup') throw new GoTrueError(400, 'validation_failed', `Resend type ${type} is not offered: use signup`)
        if (auth.signUp && (await hasPendingSignUp(await context(), email))) await sendSignUpCode(c.req.raw, email)
        return c.json({})
      })
  )
}
