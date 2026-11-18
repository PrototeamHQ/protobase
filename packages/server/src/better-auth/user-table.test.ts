import { getSchema } from 'better-auth/db'
import { describe, expect, it } from 'vitest'
import { betterAuthOptions, type CreateAuthOptions } from './create-auth'
import { resolveOrganizations } from './organizations/options'
import { roleDefinitions } from './organizations/role-definitions'
import { userTableOptions, type UserTableSettings } from './user-table'

const base: CreateAuthOptions = { database: undefined, baseURL: 'https://admin.example.com', secret: 'test-secret-test-secret-test-secret-1234' }

// Every plugin with columns on the user table: admin, two-factor, roles and organizations; the user table as `auth.users` gives it.
const schemaWith = (users?: UserTableSettings) =>
  getSchema(
    betterAuthOptions(
      { ...base, ...userTableOptions(users) },
      {
        roles: ['admin', 'user'],
        definitions: roleDefinitions(),
        mailer: { send: async () => ({}) },
        organizations: resolveOrganizations({}, roleDefinitions({ sales: 'Sales' }, { organizations: true })),
      },
    ),
  )

const userColumns = ['name', 'email', 'email_verified', 'email_confirmed_at', 'image', 'created_at', 'updated_at', 'role', 'banned', 'ban_reason', 'ban_expires', 'two_factor_enabled', 'last_role', 'last_organization_id']

describe('the user table', () => {
  it('is `user` with the columns Protobase names by default', () => {
    const schema = schemaWith()
    expect(Object.keys(schema.user!.fields).sort()).toEqual([...userColumns].sort())
  })

  it('takes the name and columns the app gives, for every plugin, and the other tables point at it', () => {
    const renamed = Object.fromEntries(userColumns.map((column) => [column, `app_${column}`]))
    const schema = schemaWith({ table: 'users', columns: renamed, metadata: 'raw_user_meta_data' })
    expect(schema).not.toHaveProperty('user')
    expect(Object.keys(schema.users!.fields).sort()).toEqual([...Object.values(renamed), 'raw_user_meta_data'].sort())
    expect(schema.users!.fields.raw_user_meta_data).toMatchObject({ type: 'json', required: false })
    expect(schema.session!.fields.user_id!.references).toMatchObject({ model: 'users', field: 'id' })
    expect(schema.member!.fields.user_id!.references).toMatchObject({ model: 'users', field: 'id' })
  })

  it('maps only the columns named, such as the role where the Postgres role is', () => {
    const schema = schemaWith({ table: 'users', columns: { role: 'app_role' } })
    expect(Object.keys(schema.users!.fields).sort()).toEqual([...userColumns.filter((column) => column !== 'role'), 'app_role'].sort())
  })

  it('refuses a column the user table does not have', () => {
    expect(() => schemaWith({ columns: { phone: 'phone' } as never })).toThrow(/^auth\.tables\.user\.columns names "phone", which is not a column of user: name, email/)
  })
})

describe('userTableOptions', () => {
  it("names the model's user table and its columns after auth.users, and keeps its other options", () => {
    expect(userTableOptions({ table: 'users', columns: { role: 'app_role' }, metadata: 'raw_user_meta_data', guardedSchemas: ['auth'] })).toEqual({
      tables: { user: { name: 'users', columns: { role: 'app_role' } } },
      users: { metadata: 'raw_user_meta_data', guardedSchemas: ['auth'] },
    })
  })

  it('keeps the built-in names without a table or columns', () => {
    expect(userTableOptions({ metadata: 'meta' })).toEqual({ users: { metadata: 'meta' } })
    expect(userTableOptions()).toEqual({ users: {} })
  })
})
