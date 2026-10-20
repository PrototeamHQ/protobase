import { getSchema } from 'better-auth/db'
import { describe, expect, it } from 'vitest'
import { betterAuthOptions, type CreateAuthOptions } from './create-auth'
import { resolveOrganizations } from './organizations/options'
import { roleDefinitions } from './organizations/role-definitions'
import { userTable } from './user-table'

const base: CreateAuthOptions = { database: undefined, baseURL: 'https://admin.example.com', secret: 'test-secret-test-secret-test-secret-1234' }

// Every plugin with columns on the user table: admin, two-factor, roles and organizations.
const schemaWith = (users?: CreateAuthOptions['users']) =>
  getSchema(
    betterAuthOptions(
      { ...base, ...(users && { users }) },
      {
        roles: ['admin', 'user'],
        definitions: roleDefinitions(),
        mailer: { send: async () => {} },
        organizations: resolveOrganizations({}, roleDefinitions({ sales: 'Sales' }, { organizations: true }), 'https://admin.example.com'),
      },
    ),
  )

const userColumns = ['name', 'email', 'email_verified', 'image', 'created_at', 'updated_at', 'role', 'banned', 'ban_reason', 'ban_expires', 'two_factor_enabled', 'last_role', 'last_organization_id']

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
    expect(() => userTable({ columns: { phone: 'phone' } as never })).toThrow(/^users\.columns names "phone", which is not a column of the user table: name, email/)
  })
})
