import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'

/** Current-password checks one account gets per window, whatever address they come from. */
export const passwordChecksPerWindow = 5
export const passwordCheckWindowSeconds = 60
// Accounts tracked at once: at the cap, the oldest window is forgotten first.
const maxTrackedAccounts = 10_000

// Every endpoint that checks the signed-in account's current password, with the body field that holds it.
const checkedFields: Record<string, 'password' | 'currentPassword'> = {
  '/change-password': 'currentPassword',
  '/verify-password': 'password',
  '/delete-user': 'password',
  '/two-factor/enable': 'password',
  '/two-factor/disable': 'password',
  '/two-factor/get-totp-uri': 'password',
  '/two-factor/generate-backup-codes': 'password',
}

/**
 * Counts the checks of each account in a fixed window that opens at its first check: `take` answers how many seconds
 * the account waits before its next check, or `undefined` when this one may go ahead and is counted. Bounded: a window
 * that ended is dropped, and at `maxTracked` accounts the oldest window is dropped.
 */
export const checkCounter = ({ max, windowSeconds, maxTracked = maxTrackedAccounts, now = Date.now }: { max: number; windowSeconds: number; maxTracked?: number; now?: () => number }) => {
  const windows = new Map<string, { opened: number; count: number }>()
  const windowMs = windowSeconds * 1000

  const prune = (at: number) => {
    for (const [key, window] of windows) if (at - window.opened >= windowMs) windows.delete(key)
    while (windows.size >= maxTracked) windows.delete(windows.keys().next().value!)
  }

  return {
    take: (key: string) => {
      const at = now()
      const window = windows.get(key)
      if (window && at - window.opened < windowMs) {
        if (window.count >= max) return Math.ceil((window.opened + windowMs - at) / 1000)
        window.count += 1
        return
      }
      windows.delete(key)
      prune(at)
      windows.set(key, { opened: at, count: 1 })
      return
    },
  }
}

/**
 * Limits the current-password checks behind a session to `passwordChecksPerWindow` an account a minute, on top of
 * Better Auth's limit per client address, so a stolen session cannot guess the password from many addresses. Every
 * check counts, a right one too, and is counted before the password is compared, so requests sent at once cannot pass
 * the limit together. A refused check answers `429 TOO_MANY_PASSWORD_CHECKS`, with `X-Retry-After` in seconds. A
 * request without a session is left to the endpoint, which refuses it. The count lives in this process's memory.
 */
export const passwordChecksPlugin = (counter = checkCounter({ max: passwordChecksPerWindow, windowSeconds: passwordCheckWindowSeconds })) =>
  ({
    id: 'protobase-password-checks',
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path !== undefined && Object.hasOwn(checkedFields, ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            const password = (ctx.body as Record<string, unknown> | undefined)?.[checkedFields[ctx.path!]!]
            if (typeof password !== 'string' || password === '') return
            const session = await getSessionFromCtx(ctx)
            if (!session) return
            const wait = counter.take(session.user.id)
            if (wait === undefined) return
            throw new APIError('TOO_MANY_REQUESTS', { code: 'TOO_MANY_PASSWORD_CHECKS', message: 'Too many password attempts. Try again in a minute.' }, { 'X-Retry-After': String(wait) })
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
