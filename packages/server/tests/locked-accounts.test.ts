import { describe, expect, it } from 'vitest'
import { createAuth } from '../src/better-auth/create-auth'
import { lockAccounts } from '../src/better-auth/locked-accounts'
import type { AuthContext } from '../src/better-auth/organizations/store'
import { openSnapshotDb, settled } from '../../../test-support/sql-snapshot'

describe('a locked account', () => {
  it('refuses a write over many rows that takes one of its rows along, past the 100 rows a read returns untold', async () => {
    const store = await openSnapshotDb('auth')
    const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: 'http://localhost:5173', secret: 'test-secret-test-secret-test-secret-1234', mailer: false })
    // Its schema check, which starts once its context is made, finishes before the test's queries.
    const { adapter } = (await auth.$context) as unknown as AuthContext
    await settled()
    // 150 people who signed in with a provider, and the locked demo account last, after them.
    await store.exec(`insert into "user" (id, name, email, email_verified, created_at, updated_at)
      select 'u' || i, 'User ' || i, 'user' || i || '@example.com', true, now(), now() from generate_series(1, 151) i;
    update "user" set email = 'demo@example.com' where id = 'u151';
    insert into account (id, account_id, provider_id, user_id, created_at, updated_at)
      select 'a' || i, 'github-' || i, 'github', 'u' || i, now(), now() from generate_series(1, 151) i`)
    const locked = lockAccounts(adapter, ['demo@example.com'])
    await expect(locked.deleteMany({ model: 'account', where: [{ field: 'providerId', value: 'github' }] })).rejects.toMatchObject({ body: { code: 'ACCOUNT_LOCKED' } })
    expect((await store.query('select count(*)::int as accounts from account')).rows).toEqual([{ accounts: 151 }])
    await locked.deleteMany({ model: 'account', where: [{ field: 'providerId', value: 'github' }, { field: 'userId', operator: 'ne', value: 'u151' }] })
    expect((await store.query('select user_id from account')).rows).toEqual([{ user_id: 'u151' }])
  })
})
