import { describe, expect, it } from 'vitest'
import { userTable, type UserTableOptions } from '../../user-table'
import { ddlText } from '../ddl'
import { migrationNames } from './migration'
import { storeMigrations } from '.'

// A user table that is a view over another system's (`users.keyTable`), such as one over Supabase's auth.users: the
// app's own migration makes the view, so the store's leave it alone and point every foreign key at the key table.

const users: UserTableOptions = { table: 'users', columns: { role: 'app_role' }, metadata: 'raw_user_meta_data' }
const statementsOf = (options: UserTableOptions) => {
  const names = migrationNames({ schema: 'app_auth', users: userTable(options), uuidIds: true })
  return storeMigrations.flatMap((migration) => migration.statements(names).map(ddlText))
}
const userDdl = (statement: string) => /^(create table if not exists|alter table) "app_auth"\."users"/.test(statement)
// What each column holding a user's id references.
const references = (statements: string[]) => statements.flatMap((statement) => [...statement.matchAll(/\b(?:user_id|inviter_id) [^,\n]* (references "[^"]+"\."[^"]+" \(id\))/g)].map((match) => match[1]!))

describe('the store over a user view', () => {
  const plain = statementsOf(users)
  const viewed = statementsOf({ ...users, keyTable: { schema: 'auth', table: 'users' } })

  it('makes nothing of the user table and points every foreign key at the key table', () => {
    expect(viewed.join('\n')).not.toContain('"app_auth"."users"')
    expect(references(viewed)).toHaveLength(references(plain).length)
    expect(new Set(references(viewed))).toEqual(new Set(['references "auth"."users" (id)']))
  })

  it('is otherwise the store without the option, statement by statement', () => {
    const kept = plain.filter((statement) => !userDdl(statement)).map((statement) => statement.replaceAll('"app_auth"."users"', '"auth"."users"'))
    expect(viewed).toEqual(kept)
  })

  it('makes the user table and its columns without the option, and points the foreign keys at it', () => {
    expect(plain.filter(userDdl)).toEqual([
      'create table if not exists "app_auth"."users" (id uuid default pg_catalog.gen_random_uuid() primary key)',
      expect.stringMatching(/^alter table "app_auth"\."users"\n {2}add column if not exists "name" text not null,/),
      'alter table "app_auth"."users" add column if not exists "raw_user_meta_data" jsonb',
      'alter table "app_auth"."users" add column if not exists "two_factor_enabled" boolean',
      'alter table "app_auth"."users" add column if not exists "last_organization_id" text',
    ])
    expect(new Set(references(plain))).toEqual(new Set(['references "app_auth"."users" (id)']))
  })
})
