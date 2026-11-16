import { Kysely } from 'kysely'
import { beforeAll, expect } from 'vitest'
import { betterAuthAuthenticator } from '../../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../../src/better-auth/create-auth'
import { createUser } from '../../src/better-auth/users'
import { createAdmin } from '../../src/create-admin'
import type { MailMessage } from '../../src/mail/smtp-mailer'
import { openSnapshotDb, type SnapshotDb } from '../../../../test-support/sql-snapshot'

// Apps with open sign-up, for the sign-up tests: each on a copy of a store, keeping the mail it sends.

export const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
export const password = 'correct horse battery'
const roles = ['admin', 'member', 'editor']

const authOf = (store: SnapshotDb, options: Partial<CreateAuthOptions> = {}) =>
  createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret, roles, defaultRole: 'member', mailer: false, ...options })

/**
 * The `serve` of a test file: before its tests, an empty store, and one with an admin (root) and a member (Sanne), made
 * once, as hashing their passwords is the slow part. `dialect` is the empty store's, for an app the test only makes.
 */
export const signUpServer = () => {
  let empty: SnapshotDb
  let withUsers: SnapshotDb
  let appDb: Kysely<any>
  beforeAll(async () => {
    empty = await openSnapshotDb('auth')
    withUsers = await empty.clone()
    const auth = authOf(withUsers)
    await createUser(auth, { email: 'root@example.com', password })
    await createUser(auth, { email: 'sanne@example.com', password, role: 'member' })
    appDb = new Kysely<any>({ dialect: empty.dialect })
    // React Email and the templates load with the first auth email; render one here, so no test pays for that load.
    await (await import('../../src/better-auth/auth-mail/auth-emails')).accountExistsEmail.render({ app: { name: 'Protobase', url: `${origin}/` } })
  }, 60_000)

  // Better Auth's rate limits are per client address and kept in memory, so every app gets an address of its own.
  let client = 0

  // Every app gets a copy of the store with an admin and a member, or of the empty one, and keeps the mail it sends.
  const serve = async (options: Partial<CreateAuthOptions> = {}, { users = true } = {}) => {
    const store = await (users ? withUsers : empty).clone()
    const sent: MailMessage[] = []
    const auth = authOf(store, { mailer: { send: async (message) => void sent.push(message) }, ...options })
    const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth })
    const address = `192.0.2.${++client}`
    const request = (path: string, init: { body?: unknown; cookie?: string } = {}) =>
      app.request(`${origin}/api/auth${path}`, {
        method: init.body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': address, ...(init.cookie && { cookie: init.cookie }) },
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      })
    const status = async () => (await request('/status')).json()
    // Mail goes out after the answer: an answered code request waits for its mail, the first one rendered included.
    const askCode = async (email: string) => {
      const before = sent.length
      const response = await request('/sign-up/send-code', { body: { email } })
      if (response.ok) await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(before)
      return response
    }
    const codeFor = (to: string) => {
      const message = sent.findLast((mail) => mail.to === to)
      const code = message && /^\d{6}$/m.exec(message.text)?.[0]
      if (!code) throw new Error(`No code mailed to ${to}`)
      return code
    }
    const cookiesOf = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]!).filter((pair) => !pair.endsWith('=')).join('; ')
    const tokenOf = async (cookie: string) => (await (await request('/token', { cookie })).json()) as { token?: string; code?: string }
    const verify = (email: string, code: string) => request('/sign-up/verify-code', { body: { email, code } })
    // The ticket a right code for `to` is traded for: what makes the account.
    const ticketFor = async (to: string) => {
      await askCode(to)
      const { ticket } = (await (await verify(to, codeFor(to))).json()) as { ticket: string }
      return ticket
    }
    // The emailed sign-in code, asked for and signed in with as the sign-in page does.
    const askSignInCode = async (email: string) => {
      const before = sent.length
      const response = await request('/email-otp/send-verification-otp', { body: { email, type: 'sign-in' } })
      if (response.ok) await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(before)
      return response
    }
    const signInWithCode = (email: string, otp: string) => request('/sign-in/email-otp', { body: { email, otp } })
    let root: string | undefined
    // Root, the admin, signed in once per app.
    const rootCookie = async () => (root ??= cookiesOf(await request('/sign-in/email', { body: { email: 'root@example.com', password } })))
    // Root invites the address to the app, and the invitation email has gone out.
    const invite = async (email: string, invitedRoles: string[]) => {
      const before = sent.length
      const invited = await request('/users/invite', { cookie: await rootCookie(), body: { email, roles: invitedRoles } })
      expect(invited.status).toBe(200)
      await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(before)
      return ((await invited.json()) as { id: string }).id
    }
    const invitations = async () => ((await (await request('/users/invitations', { cookie: await rootCookie() })).json()) as { invitations: { email: string }[] }).invitations
    const userOf = async (email: string) => (await (await auth.$context).internalAdapter.findUserByEmail(email))?.user as { role?: string; name: string; emailVerified: boolean } | undefined
    return { auth, store, sent, request, askCode, status, codeFor, cookiesOf, tokenOf, verify, ticketFor, askSignInCode, signInWithCode, rootCookie, invite, invitations, userOf }
  }

  return { serve, dialect: () => empty.dialect }
}
