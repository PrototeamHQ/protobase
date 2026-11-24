import { PostgresDialect } from 'kysely'
import { describe, expect, it } from 'vitest'
import { authStoreTables } from './auth-tables'
import { createAuth } from './create-auth'
import type { UserTableOptions } from './user-table'

const named = { user: { name: 'users' } }

// The store never connects: the tables are read from the options alone.
const authWith = (users: UserTableOptions, tables: Record<string, { name: string }> = named) =>
  createAuth({ database: { dialect: new PostgresDialect({ pool: () => Promise.reject(new Error('no database')) }), type: 'postgres', schemaName: 'app_auth' }, baseURL: 'http://localhost', secret: 'auth-tables-test-secret-0123456789', mailer: false, tables, users })

describe('authStoreTables', () => {
  it('holds the user table and every table of the store, in its schema', () => {
    const { tables, schemas } = authStoreTables(authWith({}))
    expect(schemas).toEqual([])
    expect(tables).toContainEqual({ schema: 'app_auth', name: 'users' })
    expect(tables).toContainEqual({ schema: 'app_auth', name: 'account' })
    expect(tables).toContainEqual({ schema: 'app_auth', name: 'auth_migrations' })
    expect(tables.every((table) => table.schema === 'app_auth')).toBe(true)
  })

  it('holds the tables of the modules that are off, which may keep their rows, without clashing with those on', () => {
    expect(authStoreTables(authWith({})).tables).toContainEqual({ schema: 'app_auth', name: 'personal_access_token' })
    // Organizations are off, so a user table may take the name their table would have.
    const { tables } = authStoreTables(authWith({}, { user: { name: 'organization' } }))
    expect(tables.filter(({ name }) => name === 'organization')).toHaveLength(1)
  })

  it('holds the key table under a user view too, with the password hashes the view leaves out', () => {
    const plain = authStoreTables(authWith({}))
    const viewed = authStoreTables(authWith({ keyTable: { schema: 'auth', table: 'users' } }))
    expect(viewed).toEqual({ tables: [...plain.tables, { schema: 'auth', name: 'users' }], schemas: [] })
  })

  it('guards only the schemas the config names, never the key table\'s schema on its own', () => {
    const inPublic = authStoreTables(authWith({ keyTable: { schema: 'public', table: 'people' } }))
    expect(inPublic.schemas).toEqual([])
    const guarded = authStoreTables(authWith({ keyTable: { schema: 'auth', table: 'users' }, guardedSchemas: ['auth'] }))
    expect(guarded.schemas).toEqual(['auth'])
    expect(guarded.tables).toEqual(authStoreTables(authWith({ keyTable: { schema: 'auth', table: 'users' } })).tables)
  })
})
