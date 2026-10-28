import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'
import { countSsoUsers, refuseSsoUsers, ssoUsersQuery } from '../../src/supabase/sso-users'
import { splitDump } from '../../src/supabase/statements'

// Supabase Auth's users table and its unique index on email, as the dump of schema-restore.test.ts has them.
const kept = /^(CREATE SCHEMA auth;|CREATE TABLE auth\.users |ALTER TABLE ONLY auth\.users\n|CREATE (UNIQUE )?INDEX \S+ ON auth\.users )/
const usersTable = splitDump(readFileSync(new URL('fixtures/supabase-schema.sql', import.meta.url), 'utf8'))
  .filter((piece) => piece.kind === 'statement' && kept.test(piece.text))
  .map((piece) => piece.text)
  .join('\n')

it('refuses a Supabase project with single sign-on users, counting those that share an address', async () => {
  const pg = await openSnapshotDb('empty')
  await pg.exec(usersTable)
  const count = () => countSsoUsers((text) => pg.query(text).then((result) => result.rows))

  await pg.exec("insert into auth.users (id, email, encrypted_password, email_confirmed_at) values ('0fd5f0e7-858d-4984-ad61-299783467157', 'alice@example.com', '$2a$10$hash', now())")
  expect(await count()).toEqual({ shared: 0, alone: 0 })
  expect(() => refuseSsoUsers({ shared: 0, alone: 0 })).not.toThrow()

  // GoTrue's unique index on email skips SSO users, so alice's address has a row of each kind; bob's has only his.
  await pg.exec("insert into auth.users (id, email, email_confirmed_at, is_sso_user) values ('5d1c3a8e-2f4b-4c6d-9e8f-0a1b2c3d4e5f', 'Alice@example.com', now(), true)")
  await pg.exec("insert into auth.users (id, email, email_confirmed_at, is_sso_user) values ('8b2e4f6a-1c3d-4e5f-a7b9-c0d1e2f3a4b5', 'bob@example.com', now(), true)")
  expect(await count()).toEqual({ shared: 1, alone: 1 })

  // A GoTrue older than is_sso_user has none.
  await pg.exec('alter table auth.users drop column is_sso_user cascade')
  expect(await count()).toEqual({ shared: 0, alone: 0 })
})

it('says how many users block the import, how to list them and what deleting one does, without their addresses', () => {
  const refusal = () => refuseSsoUsers({ shared: 1, alone: 2 })
  expect(refusal).toThrow('The Supabase project has 3 single sign-on (SAML) users, which the import cannot carry over')
  expect(refusal).toThrow('1 user shares its address with another user of auth.users, 2 users have an address of their own')
  expect(refusal).toThrow(`List them in Supabase with: ${ssoUsersQuery}`)
  expect(refusal).toThrow("Deleting a user in Supabase deletes or breaks the app's rows that reference it")
  expect(refusal).toThrow('What to do about these users is your decision')
  expect(refusal).not.toThrow(/merge|@/i)
  expect(() => refuseSsoUsers({ shared: 0, alone: 1 })).toThrow('1 single sign-on (SAML) user, which')
})
