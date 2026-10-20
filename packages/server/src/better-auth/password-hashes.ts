import bcrypt from 'bcryptjs'
import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { verifyPassword } from 'better-auth/crypto'

// Passwords another system hashed, such as Supabase Auth's bcrypt, sign in as they are; the first sign-in with one
// rehashes it to Better Auth's own scrypt, which every new password gets. bcryptjs, not `Bun.password`, since the CLI
// also runs on Node.

/** The hash formats sign-in accepts besides Better Auth's own. */
export type PasswordHash = 'bcrypt'

const formats: Record<PasswordHash, { matches: (hash: string) => boolean; verify: (password: string, hash: string) => Promise<boolean> }> = {
  bcrypt: { matches: (hash) => /^\$2[aby]\$/.test(hash), verify: (password, hash) => bcrypt.compare(password, hash) },
}

const formatOf = (accepted: PasswordHash[], hash: string) => accepted.map((name) => formats[name]).find((format) => format.matches(hash))

/** Better Auth's `password.verify`: the accepted formats first, then its own scrypt. */
export const verifyAcceptedHash =
  (accepted: PasswordHash[]) =>
  ({ hash, password }: { hash: string; password: string }) =>
    formatOf(accepted, hash)?.verify(password, hash) ?? verifyPassword({ hash, password })

/** After a sign-in with a password in one of the accepted formats, stores it again as Better Auth hashes it. */
export const rehashPasswordsPlugin = (accepted: PasswordHash[]) =>
  ({
    id: 'protobase-rehash-passwords',
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === '/sign-in/email',
          handler: createAuthMiddleware(async (ctx) => {
            // Any answer but an error follows a password that matched, also one that asks for a second factor next.
            if (ctx.context.returned instanceof APIError) return
            const { email, password } = ctx.body as { email: string; password: string }
            const found = await ctx.context.internalAdapter.findUserByEmail(email.toLowerCase(), { includeAccounts: true })
            const account = found?.accounts.find((candidate) => candidate.providerId === 'credential' && candidate.accountId === found.user.id)
            if (!found || !account?.password || !formatOf(accepted, account.password)) return
            await ctx.context.internalAdapter.updatePassword(found.user.id, await ctx.context.password.hash(password))
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
