import { describe, expect, it, vi } from 'vitest'
import { createAuth } from '../src/better-auth/create-auth'
import { listOrganizations } from '../src/better-auth/organizations/host'
import type { AuthContext } from '../src/better-auth/organizations/store'
import { signInPasskeyDomains } from '../src/better-auth/passkey-domain'
import { codeSignsUp } from '../src/better-auth/sign-up/code-sign-up-plugin'
import { endStaffSignIn, listStaffSignIns, staffSignInOfSession } from '../src/better-auth/staff-log'
import { hasUsers } from '../src/better-auth/users'
import { createAppInvitation, findAppInvitationOf, listAppInvitations } from '../src/better-auth/users/app-invitation-store'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { largeTable, seqScansOf, watchStatements } from '../../../test-support/query-plans'

// The auth store's lookups, as they are sent, on as many rows as a busy app holds: each one finds its rows by an index.
// Too many rows for a recording to hold, and plans a recording cannot make.
vi.setConfig({ testTimeout: 60_000 })

const ready = await postgresTemplateReady('auth')

const serve = async () => {
  const store = await openPostgresDatabase('auth')
  const watched = watchStatements(store)
  const auth = createAuth({
    database: { dialect: watched.dialect, type: 'postgres' },
    baseURL: 'http://localhost:5173',
    secret: 'test-secret-test-secret-test-secret-1234',
    mailer: false,
    organizations: { create: 'everyone' },
  })
  const context = (await auth.$context) as unknown as AuthContext
  // The rows, then the statistics the planner reads them by, as autovacuum would keep them.
  const fill = async (statements: string) => {
    await store.exec(`${statements}; analyze`)
    watched.forget()
  }
  return { store, auth, context, fill, ...watched }
}

const root = `insert into "user" (id, name, email, email_verified, role, banned, created_at, updated_at)
  values ('root', 'Root', 'root@example.com', true, 'admin', false, now(), now())`

describe.skipIf(!ready)('the auth store lookups', () => {
  it('ask whether any user exists, as the status route and sign-up do, by the first of 100,000 rows', async () => {
    const { auth, context, fill, plansOf } = await serve()
    expect(await hasUsers(auth)).toBe(false)
    await fill(`${largeTable('"user"', ['email'])}; insert into "user" (id, name, email, email_verified, role, banned, created_at, updated_at)
      select 'u' || i, 'User ' || i, 'user' || i || '@example.com', true, 'user', false, now(), now() from generate_series(1, 100000) i`)
    expect(await hasUsers(auth)).toBe(true)
    expect(await codeSignsUp(context, 'new@example.com', undefined)).toBe(true)
    const plans = await plansOf('user')
    expect(plans).toHaveLength(2)
    // A count would read every row; the plan stops at the first.
    expect(plans.filter((plan) => !plan.startsWith('Limit'))).toEqual([])
  })

  it('page through 100,000 organizations by their creation', async () => {
    const { auth, fill, plansOf } = await serve()
    await fill(`${largeTable('organization', ['created_at', 'id'])}; insert into organization (id, name, slug, created_at)
      select 'o' || i, 'Organization ' || i, 'organization-' || i, timestamptz '2026-07-01 00:00:00+00' + i * interval '1 second' from generate_series(1, 100000) i`)
    const first = await listOrganizations(auth, { size: 100 })
    const second = await listOrganizations(auth, { after: first.next!, size: 100 })
    expect([first.organizations[0]!.slug, second.organizations[0]!.slug]).toEqual(['organization-1', 'organization-101'])
    const plans = await plansOf('organization')
    expect(plans).toHaveLength(2)
    expect(seqScansOf(plans, 'organization')).toEqual([])
  })

  it('find which other hosts hold a passkey among 100,000, passkeys made before they kept their RP ID counting for the first', async () => {
    const { context, fill, plansOf } = await serve()
    const origins = ['https://erp-x1.protobase.net', 'https://admin.shop.com', 'https://admin.shop.com:8443', 'https://shop.example']
    await fill(`${root}; ${largeTable('passkey', ['rp_id'])}; insert into passkey (id, public_key, user_id, credential_id, counter, device_type, backed_up, rp_id)
      select 'p' || i, 'key', 'root', 'credential-' || i, 0, 'singleDevice', false, 'admin.shop.com' from generate_series(1, 100000) i`)
    expect(await signInPasskeyDomains(context.adapter, 'admin.shop.com', origins)).toEqual(['admin.shop.com'])
    await fill(`insert into passkey (id, public_key, user_id, credential_id, counter, device_type, backed_up, rp_id) values ('before', 'key', 'root', 'before', 0, 'singleDevice', false, null)`)
    expect(await signInPasskeyDomains(context.adapter, 'admin.shop.com', origins)).toEqual(['admin.shop.com', 'erp-x1.protobase.net'])
    // The hosts with few passkeys or none are looked up by the index; the host of nearly all is found on any first row.
    const plans = await plansOf('passkey')
    expect(plans).toHaveLength(2)
    expect(seqScansOf(plans, 'passkey')).toEqual([])
    await fill(`insert into passkey (id, public_key, user_id, credential_id, counter, device_type, backed_up, rp_id) values ('shop', 'key', 'root', 'shop', 0, 'singleDevice', false, 'shop.example')`)
    expect(await signInPasskeyDomains(context.adapter, 'erp-x1.protobase.net', origins)).toEqual(['erp-x1.protobase.net', 'admin.shop.com', 'shop.example'])
  })

  it('find the staff sign-in of a session, end it, and list the newest, among 100,000', async () => {
    const { context, fill, plansOf } = await serve()
    await fill(`${largeTable('staff_sign_in', ['session_id', 'started_at'])}; insert into staff_sign_in (id, user_id, user_email, staff, staff_subject, issuer, reason, session_id, started_at, expires_at)
      select 's' || i, 'root', 'root@example.com', 'staff@example.com', 'subject', 'https://central.example', 'support', 'session-' || i,
        timestamptz '2026-07-01 00:00:00+00' + i * interval '1 second', timestamptz '2026-07-02 00:00:00+00' + i * interval '1 second'
      from generate_series(1, 100000) i`)
    expect((await staffSignInOfSession(context.adapter, 'session-5'))?.id).toBe('s5')
    await endStaffSignIn(context.adapter, 'session-5')
    expect((await staffSignInOfSession(context.adapter, 'session-5'))?.endedAt).toBeDefined()
    expect((await listStaffSignIns(context.adapter)).map((entry) => entry.id).slice(0, 2)).toEqual(['s100000', 's99999'])
    const plans = await plansOf('staff_sign_in')
    expect(plans).toHaveLength(4)
    expect(seqScansOf(plans, 'staff_sign_in')).toEqual([])
  })

  it('list, find and replace the app invitations among 100,000 other verifications', async () => {
    const { context, fill, plansOf } = await serve()
    await fill(`${root}; ${largeTable('verification', ['identifier'])}; insert into verification (id, identifier, value, expires_at, created_at, updated_at)
      select 'v' || i, 'email-verification:' || i, 'token', now() + interval '1 day', now(), now() from generate_series(1, 100000) i`)
    await createAppInvitation(context, { email: 'ana@example.com', roles: ['user'], inviterId: 'root' }, 86_400)
    await createAppInvitation(context, { email: 'ana@example.com', roles: ['support'], inviterId: 'root' }, 86_400)
    expect((await listAppInvitations(context)).map(({ email, roles }) => ({ email, roles }))).toEqual([{ email: 'ana@example.com', roles: ['support'] }])
    expect((await findAppInvitationOf(context, 'ana@example.com'))?.roles).toEqual(['support'])
    const plans = await plansOf('verification')
    expect(plans.length).toBeGreaterThanOrEqual(4)
    expect(seqScansOf(plans, 'verification')).toEqual([])
  })
})
