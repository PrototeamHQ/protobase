import { betterAuth } from 'better-auth'
import { describe, expect, it } from 'vitest'
import { roleDefinitions } from '../src/better-auth/organizations/role-definitions'
import { personalAccessTokensPlugin } from '../src/better-auth/personal-access-tokens/token-plugin'
import { deleteToken, findTokenByHash, noteUse, storeToken, tokensOf } from '../src/better-auth/personal-access-tokens/token-store'
import { signInPolicyPlugin } from '../src/better-auth/policy-plugin'
import { readSignInPolicy, saveSignInPolicy } from '../src/better-auth/policy-store'
import { defaultSignInPolicy } from '../src/better-auth/sign-in-policy'
import { endStaffSignIn, listStaffSignIns, logStaffSignIn, staffSignInOfSession } from '../src/better-auth/staff-log'
import { staffSignInPlugin } from '../src/better-auth/staff-plugin'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'

// The sign-in stores on tables and columns of other names than their own, as their plugins' `schema` option gives them.

const ready = await postgresTemplateReady('empty')

const tables = `
create table renamed_policy (
  id text primary key, r_password text not null, r_email_code text not null, r_passkey text not null, r_two_factor text not null,
  r_staff_access text not null, r_platform_sign_in text not null, r_created_at timestamptz not null, r_created_by text
);
create table renamed_staff_log (
  id text primary key, r_user_id text not null, r_user_email text not null, r_staff text not null, r_staff_name text,
  r_staff_subject text not null, r_issuer text not null, r_reason text not null, r_session_id text not null,
  r_started_at timestamptz not null, r_expires_at timestamptz not null, r_ended_at timestamptz
);
create table renamed_tokens (
  id text primary key, r_user_id text not null, r_name text not null, r_token_hash text not null unique, r_role text not null,
  r_organization_id text, r_created_at timestamptz not null, r_expires_at timestamptz, r_last_used_at timestamptz
)`

const columns = <F extends string>(...fields: F[]) => Object.fromEntries(fields.map((field) => [field, `r_${field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`])) as Record<F, string>

const serve = async () => {
  const store = await openPostgresDatabase('empty')
  await store.exec(tables)
  const auth = betterAuth({
    database: { dialect: store.dialect, type: 'postgres' },
    baseURL: 'http://localhost:5173',
    secret: 'test-secret-test-secret-test-secret-1234',
    plugins: [
      signInPolicyPlugin({
        mail: false,
        defaultPolicy: defaultSignInPolicy,
        socialProviders: [],
        platformSignIn: [],
        schema: {
          signInPolicy: { modelName: 'renamed_policy', fields: columns('password', 'emailCode', 'passkey', 'twoFactor', 'staffAccess', 'platformSignIn', 'createdAt', 'createdBy') },
        },
      }),
      staffSignInPlugin({
        defaultPolicy: defaultSignInPolicy,
        schema: {
          staffSignIn: {
            modelName: 'renamed_staff_log',
            fields: columns('userId', 'userEmail', 'staff', 'staffName', 'staffSubject', 'issuer', 'reason', 'sessionId', 'startedAt', 'expiresAt', 'endedAt'),
          },
        },
      }),
      personalAccessTokensPlugin({
        options: { prefix: 'test_' },
        definitions: roleDefinitions(),
        schema: {
          personalAccessToken: { modelName: 'renamed_tokens', fields: columns('userId', 'name', 'tokenHash', 'role', 'organizationId', 'createdAt', 'expiresAt', 'lastUsedAt') },
        },
      }),
    ],
  })
  return { store, adapter: (await auth.$context).adapter }
}

describe.skipIf(!ready)('the sign-in stores on renamed tables', () => {
  it('save and read the sign-in policy', async () => {
    const { store, adapter } = await serve()
    const policy = { ...defaultSignInPolicy, twoFactor: 'required' as const, platformSignIn: 'forbidden' as const }
    await saveSignInPolicy(adapter, policy, 'admin-1')
    const stored = await readSignInPolicy(adapter, defaultSignInPolicy)
    expect(stored.policy).toEqual(policy)
    expect(stored.savedBy).toBe('admin-1')
    const { rows } = await store.pool().query('select r_two_factor, r_created_by from renamed_policy')
    expect(rows).toEqual([{ r_two_factor: 'required', r_created_by: 'admin-1' }])
  })

  it('log, find, end and list staff sign-ins', async () => {
    const { adapter } = await serve()
    const startedAt = new Date('2026-11-18T10:00:00Z')
    const expiresAt = new Date('2026-11-18T11:00:00Z')
    await logStaffSignIn(adapter, {
      userId: 'u1',
      userEmail: 'person@example.com',
      staff: 'staff@operator.example',
      staffSubject: 's1',
      issuer: 'https://id.operator.example',
      reason: 'Support request',
      sessionId: 'session-1',
      startedAt,
      expiresAt,
    })
    expect(await staffSignInOfSession(adapter, 'session-1')).toMatchObject({ user: 'person@example.com', reason: 'Support request', startedAt: startedAt.toISOString() })
    await endStaffSignIn(adapter, 'session-1')
    const [entry] = await listStaffSignIns(adapter)
    expect(entry?.endedAt).toBeDefined()
  })

  it('store, find, note the use of, list and delete personal access tokens', async () => {
    const { adapter } = await serve()
    const createdAt = new Date('2026-11-18T10:00:00Z')
    const row = await storeToken(adapter, { userId: 'u1', name: 'Script', tokenHash: 'hash-1', role: 'admin', organizationId: null, createdAt, expiresAt: null })
    expect(await findTokenByHash(adapter, 'hash-1')).toMatchObject({ id: row.id, userId: 'u1', name: 'Script', role: 'admin' })
    const usedAt = new Date('2026-11-18T12:00:00Z')
    await noteUse(adapter, row, usedAt)
    expect((await tokensOf(adapter, 'u1')).map((token) => new Date(token.lastUsedAt!).toISOString())).toEqual([usedAt.toISOString()])
    await deleteToken(adapter, 'u1', row.id)
    expect(await tokensOf(adapter, 'u1')).toEqual([])
  })
})
