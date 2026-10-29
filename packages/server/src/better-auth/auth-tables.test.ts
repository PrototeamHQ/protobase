import { PostgresDialect } from 'kysely'
import { describe, expect, it } from 'vitest'
import { authStoreTables } from './auth-tables'
import { createAuth } from './create-auth'
import type { UserTableOptions } from './user-table'

// The store never connects: the tables are read from the options alone.
const authWith = (users: UserTableOptions) =>
  createAuth({ database: { dialect: new PostgresDialect({ pool: () => Promise.reject(new Error('no database')) }), type: 'postgres', schemaName: 'app_auth' }, baseURL: 'http://localhost', secret: 'auth-tables-test-secret-0123456789', mailer: false, users })

describe('authStoreTables', () => {
  it('holds the user table and every table of the store, in its schema', () => {
    const tables = authStoreTables(authWith({ table: 'users' }))
    expect(tables).toContainEqual({ schema: 'app_auth', name: 'users' })
    expect(tables).toContainEqual({ schema: 'app_auth', name: 'account' })
    expect(tables).toContainEqual({ schema: 'app_auth', name: 'auth_migrations' })
    expect(tables.every((table) => table.schema === 'app_auth')).toBe(true)
  })

  it('holds the key table under a user view too, with the password hashes the view leaves out', () => {
    const plain = authStoreTables(authWith({ table: 'users' }))
    const viewed = authStoreTables(authWith({ table: 'users', keyTable: { schema: 'auth', table: 'users' } }))
    expect(viewed).toEqual([...plain, { schema: 'auth', name: 'users' }])
  })
})
