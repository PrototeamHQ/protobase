import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'
import { refuseSsoUsers, ssoUserCount } from '../../src/supabase/sso-users'
import { splitDump } from '../../src/supabase/statements'

// Supabase Auth's users table and its unique index on email, as the dump of schema-restore.test.ts has them.
const kept = /^(CREATE SCHEMA auth;|CREATE TABLE auth\.users |ALTER TABLE ONLY auth\.users\n|CREATE (UNIQUE )?INDEX \S+ ON auth\.users )/
const usersTable = splitDump(readFileSync(new URL('fixtures/supabase-schema.sql', import.meta.url), 'utf8'))
  .filter((piece) => piece.kind === 'statement' && kept.test(piece.text))
  .map((piece) => piece.text)
  .join('\n')

it('refuses a Supabase project whose single sign-on users share an address with a password user', async () => {
  const pg = await openSnapshotDb('empty')
  await pg.exec(usersTable)
  const count = () => ssoUserCount((text) => pg.query(text).then((result) => result.rows))

  await pg.exec("insert into auth.users (id, email, encrypted_password, email_confirmed_at) values ('0fd5f0e7-858d-4984-ad61-299783467157', 'alice@example.com', '$2a$10$hash', now())")
  expect(await count()).toBe(0)
  expect(() => refuseSsoUsers(0)).not.toThrow()

  // GoTrue's unique index on email skips SSO users, so alice's address has a row of each kind.
  await pg.exec("insert into auth.users (id, email, email_confirmed_at, is_sso_user) values ('5d1c3a8e-2f4b-4c6d-9e8f-0a1b2c3d4e5f', 'alice@example.com', now(), true)")
  expect(await count()).toBe(1)
  expect(() => refuseSsoUsers(1)).toThrow('The Supabase project has 1 single sign-on (SAML) user, which the import cannot carry over')

  // A GoTrue older than is_sso_user has none.
  await pg.exec('alter table auth.users drop column is_sso_user cascade')
  expect(await count()).toBe(0)
})
