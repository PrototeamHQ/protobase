import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { describe, expect, it, vi } from 'vitest'
import type { MailMessage } from '../../mail/mail-message'
import { betterAuthOptions, type CreateAuthOptions } from '../create-auth'
import { resolveOrganizations, type OrganizationsOptions } from '../organizations/options'
import { roleDefinitions } from '../organizations/role-definitions'

const baseURL = 'https://admin.example.com'
const custom = 'https://homes.example.com'
const password = 'correct horse battery'

// Better Auth with Protobase's options, `custom` as the app's other origin, on a store in memory, with an admin who
// owns one organization; `mails` holds what the mailer sent, when there is one.
const setUp = async ({ mail, invitationUrl }: { mail: boolean; invitationUrl?: string }) => {
  const store: Record<string, Record<string, unknown>[]> = { user: [], account: [], session: [], verification: [], sign_in_policy: [], jwks: [], organization: [], member: [], invitation: [] }
  const mails: MailMessage[] = []
  const organizations: OrganizationsOptions = invitationUrl === undefined ? {} : { invitationUrl }
  const definitions = roleDefinitions({ sales: 'Sales' }, { organizations: true })
  let instance: { $context: Promise<never> } | undefined
  const options: CreateAuthOptions = { database: undefined, baseURL, secret: 'test-secret-test-secret-test-secret-1234', organizations, signInPerMinute: 100 }
  const resolved = {
    origins: [custom],
    roles: definitions.names,
    definitions,
    organizations: resolveOrganizations(organizations, definitions),
    ...(mail && { mailer: { send: async (message: MailMessage) => void mails.push(message) } }),
    context: () => instance!.$context,
  }
  const auth = betterAuth({ ...betterAuthOptions({ ...options, mailer: mail ? undefined : false }, resolved), database: memoryAdapter(store) })
  instance = auth as never
  await auth.api.createUser({ body: { email: 'root@example.com', password, name: 'Root', role: 'admin' } })

  // `host` is the request's URL; `headers` adds to it, such as a proxy's `x-forwarded-host`.
  const call = (host: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
    auth.handler(new Request(`${host}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: host, ...headers }, body: JSON.stringify(body) }))
  const signedIn = await call(baseURL, '/sign-in/email', { email: 'root@example.com', password })
  const cookie = signedIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  const created = await call(baseURL, '/organization/create', { name: 'Acme', slug: 'acme' }, { cookie })
  const { id: organizationId } = (await created.json()) as { id: string }

  // The invitation link of an invitation made on `host`: the answer's without a mailer, the mail's with one.
  const linkOf = async (path: string, body: unknown, host: string, headers: Record<string, string> = {}) => {
    const sent = mails.length
    const response = await call(host, path, body, { cookie, ...headers })
    expect(response.status).toBe(200)
    const answer = (await response.json()) as { link?: string }
    if (!mail) return answer.link
    expect(answer.link).toBeUndefined()
    // The mail goes out after the response.
    await vi.waitFor(() => expect(mails).toHaveLength(sent + 1))
    return /https:\/\/\S+\?token=\S+/.exec(mails.at(-1)?.text ?? '')?.[0]
  }
  return {
    user: (host: string, headers?: Record<string, string>) => linkOf('/users/invite', { email: 'ana@example.com', roles: ['sales'] }, host, headers),
    organization: (host: string, headers?: Record<string, string>) =>
      linkOf('/organization/invite-member', { organizationId, email: 'jan@example.com', role: 'member', resend: true }, host, headers),
  }
}

// The whole link: the page, then its token alone.
const page = (url: string) => new RegExp(`^${url.replaceAll('.', '\\.')}\\?token=[^&\\s]+$`)

describe.each([false, true])('invitation links, with a mailer: %s', (mail) => {
  it.each(['user', 'organization'] as const)('of a %s invitation open on the origin it was made on', async (kind) => {
    const invite = (await setUp({ mail }))[kind]
    expect(await invite(custom)).toMatch(page(`${custom}/-/invitation`))
    expect(await invite(baseURL)).toMatch(page(`${baseURL}/-/invitation`))
  })

  it.each(['user', 'organization'] as const)("of a %s invitation made on an unknown host open on baseURL's", async (kind) => {
    const invite = (await setUp({ mail }))[kind]
    expect(await invite('https://elsewhere.example.net')).toMatch(page(`${baseURL}/-/invitation`))
    expect(await invite(baseURL, { 'x-forwarded-host': 'elsewhere.example.net' })).toMatch(page(`${baseURL}/-/invitation`))
  })

  it.each(['user', 'organization'] as const)("of a %s invitation open the app's own invitationUrl wherever made", async (kind) => {
    const invitationUrl = 'https://join.example.org/welcome'
    const invite = (await setUp({ mail, invitationUrl }))[kind]
    expect(await invite(custom)).toMatch(page(invitationUrl))
    expect(await invite(baseURL)).toMatch(page(invitationUrl))
  })
})
