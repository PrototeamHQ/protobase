import { APIError, createAuthEndpoint, type createAuthMiddleware } from 'better-auth/api'
import { expireCookie, setSessionCookie } from 'better-auth/cookies'
import * as z from 'zod'
import type { Mailer } from '../mail/smtp-mailer'
import { operatorClient, randomValue, type OperatorClient, type ResolvedOperator } from './operator-provider'
import { readSignInPolicy } from './policy-store'
import { policyRefusal, staffSignInPath } from './sign-in-enforcement'
import { staffSignInEmail } from './sign-in-mail'
import { effectiveSignInPolicy } from './sign-in-policy'
import { reasonProblem, staffClaimsRefusal, staffLabel, type StaffClaims, type StaffRefusal } from './staff-checks'
import { logStaffSignIn } from './staff-log'

type Context = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]['context']

/** What the start of a staff sign-in keeps until the provider sends the staff member back, for ten minutes at most. */
type StartedSignIn = { email: string; reason: string; callbackURL: string; nonce: string; verifier: string }

const startLifetimeMs = 10 * 60 * 1000
const stateCookie = 'staff_state'
const stateIdentifier = (state: string) => `staff-sign-in:${state}`

const expired: StaffRefusal = { code: 'STAFF_SIGN_IN_EXPIRED', message: 'This staff sign-in expired or was used already: start again.' }
const providerFailed: StaffRefusal = { code: 'STAFF_SIGN_IN_FAILED', message: 'The staff sign-in did not go through at the operator provider.' }
const userUnavailable: StaffRefusal = { code: 'STAFF_USER_UNAVAILABLE', message: 'There is no account with this address, or it is disabled.' }

const withError = (url: string, code: string) => {
  const target = new URL(url, 'http://relative')
  target.searchParams.set('staff-error', code)
  return url.startsWith('/') ? `${target.pathname}${target.search}${target.hash}` : target.toString()
}

/**
 * The two steps of a staff sign-in: the staff sign-in page starts it with the person's address and a reason, the staff
 * member signs in at the operator provider, and the provider sends them back to the callback, which checks their
 * permission and sign-in and starts a session as the person, of Better Auth's admin plugin (`impersonatedBy` names
 * them). The session is short and never extended, and the person's two-factor and passkey requirements do not stop it.
 */
export const staffSignInEndpoints = ({ operator, mailer }: { operator: ResolvedOperator; mailer?: Mailer }) => {
  let client: OperatorClient | undefined
  const clientOf = (context: Context) => (client ??= operatorClient(operator, `${context.baseURL}/staff/callback`))

  // Signs the staff member in as the person, or names why not; `undefined` once the session is started.
  const startSession = async (ctx: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0], started: StartedSignIn, claims: StaffClaims): Promise<StaffRefusal | undefined> => {
    const refusal = staffClaimsRefusal(claims, { group: operator.group, acrValues: operator.acrValues, now: Math.floor(Date.now() / 1000) })
    if (refusal) return refusal
    // The policy may have changed since the start.
    const policy = effectiveSignInPolicy((await readSignInPolicy(ctx.context.adapter)).policy, { mail: Boolean(mailer) })
    const off = policyRefusal(policy, { path: staffSignInPath })
    if (off) return off
    const found = await ctx.context.internalAdapter.findUserByEmail(started.email.toLowerCase())
    if (!found || (found.user as { banned?: boolean | null }).banned) return userUnavailable

    const staff = staffLabel(claims)
    const expiresAt = new Date(Date.now() + operator.sessionMinutes * 60 * 1000)
    if (policy.staffAccess === 'notify' && mailer) await mailer.send(staffSignInEmail({ to: found.user.email, staff, reason: started.reason, expiresAt }))
    // Not remembered, so Better Auth never extends it, and gone with the browser.
    const session = await ctx.context.internalAdapter.createSession(found.user.id, true, { impersonatedBy: staff, expiresAt }, true)
    await logStaffSignIn(ctx.context.adapter, {
      userId: found.user.id,
      userEmail: found.user.email,
      staff,
      ...(typeof claims.name === 'string' && { staffName: claims.name }),
      staffSubject: claims.sub,
      issuer: operator.issuer,
      reason: started.reason,
      sessionId: session.id,
      startedAt: new Date(),
      expiresAt,
    })
    await setSessionCookie(ctx, { session, user: found.user }, true)
    return undefined
  }

  return {
      /**
       * `POST /staff/sign-in` with `{ email, reason, callbackURL }`: answers `{ url }` at the operator provider, where
       * the staff member signs in. Only this browser can finish it, within ten minutes, once.
       */
      startStaffSignIn: createAuthEndpoint(staffSignInPath, { method: 'POST', body: z.object({ email: z.email(), reason: z.string(), callbackURL: z.string() }) }, async (ctx) => {
        const problem = reasonProblem(ctx.body.reason)
        if (problem) throw new APIError('BAD_REQUEST', { code: 'STAFF_REASON_REQUIRED', message: problem })
        // Checked here as well as by Better Auth's origin check, which a configuration can turn off.
        if (!ctx.context.isTrustedOrigin(ctx.body.callbackURL, { allowRelativePaths: true })) {
          throw new APIError('FORBIDDEN', { code: 'INVALID_CALLBACK_URL', message: 'The page to come back to is not on a trusted origin.' })
        }
        const [state, nonce, verifier] = [randomValue(), randomValue(), randomValue()]
        const started: StartedSignIn = { email: ctx.body.email, reason: ctx.body.reason.trim(), callbackURL: ctx.body.callbackURL, nonce, verifier }
        await ctx.context.internalAdapter.createVerificationValue({ identifier: stateIdentifier(state), value: JSON.stringify(started), expiresAt: new Date(Date.now() + startLifetimeMs) })
        const cookie = ctx.context.createAuthCookie(stateCookie, { maxAge: startLifetimeMs / 1000 })
        await ctx.setSignedCookie(cookie.name, state, ctx.context.secret, cookie.attributes)
        return ctx.json({ url: await clientOf(ctx.context).authorizationURL({ state, nonce, verifier }) })
      }),

      /**
       * `GET /staff/callback`, where the operator provider sends the staff member back: signed in as the person, to the
       * `callbackURL` they started from, or there with `?staff-error=<code>`.
       */
      staffCallback: createAuthEndpoint('/staff/callback', { method: 'GET', query: z.object({ state: z.string().optional(), code: z.string().optional(), error: z.string().optional() }) }, async (ctx) => {
        const cookie = ctx.context.createAuthCookie(stateCookie)
        const browserState = await ctx.getSignedCookie(cookie.name, ctx.context.secret)
        expireCookie(ctx, cookie)
        const { state, code } = ctx.query
        if (!state || state !== browserState) throw new APIError('BAD_REQUEST', expired)
        const stored = await ctx.context.internalAdapter.consumeVerificationValue(stateIdentifier(state))
        if (!stored) throw new APIError('BAD_REQUEST', expired)
        const started = JSON.parse(stored.value) as StartedSignIn
        if (!code) throw ctx.redirect(withError(started.callbackURL, providerFailed.code))
        const claims = await clientOf(ctx.context)
          .signedInStaff({ code, nonce: started.nonce, verifier: started.verifier })
          .catch((error: unknown) => {
            // Whatever the provider or its token got wrong, the staff member is sent back without a session.
            ctx.context.logger.error('Staff sign-in at the operator provider failed', error)
            return undefined
          })
        const refusal = claims ? await startSession(ctx, started, claims) : providerFailed
        throw ctx.redirect(refusal ? withError(started.callbackURL, refusal.code) : started.callbackURL)
      }),

  }
}
