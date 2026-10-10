import { getSchema } from 'better-auth/db'
import { describe, expect, it } from 'vitest'
import { betterAuthOptions } from './create-auth'
import { resolveOperator } from './operator-provider'
import { resolveOrganizations } from './organizations/options'
import { roleDefinitions } from './organizations/role-definitions'
import { resolvePlatformSignIn } from './platform-sign-in'

const snakeCase = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

describe('the auth store names', () => {
  it('are snake_case for every table, column and index, with every plugin on', () => {
    const options = betterAuthOptions(
      { database: undefined, baseURL: 'https://admin.example.com', secret: 'test-secret-test-secret-test-secret-1234' },
      {
        roles: ['admin', 'user'],
        mailer: { send: async () => {} },
        operator: resolveOperator({ issuer: 'https://id.operator.example', clientId: 'app', clientSecret: 'secret' }),
        platformSignIn: resolvePlatformSignIn({ issuer: 'https://auth.example.com', clientId: 'app', clientSecret: 'secret' }),
        organizations: resolveOrganizations({}, roleDefinitions({ sales: 'Sales' }, { organizations: true }), 'https://admin.example.com'),
      },
    )
    expect(options.plugins.map((plugin) => plugin.id)).toEqual(
      expect.arrayContaining(['admin', 'jwt', 'two-factor', 'passkey', 'email-otp', 'generic-oauth', 'protobase-sign-in-policy', 'protobase-staff-sign-in', 'organization']),
    )

    const schema = getSchema(options)
    const names = Object.entries(schema).flatMap(([table, { fields, indexes }]) => [
      table,
      ...Object.keys(fields).map((column) => `${table}.${column}`),
      ...(indexes ?? []).flatMap((index) => [index.name, ...index.columns]),
    ])
    expect(Object.keys(schema)).toEqual(['user', 'session', 'account', 'verification', 'jwks', 'two_factor', 'passkey', 'sign_in_policy', 'staff_sign_in', 'organization', 'member', 'invitation'])
    expect(Object.keys(schema.member!.fields)).toEqual(expect.arrayContaining(['organization_id', 'user_id', 'app_roles']))
    expect(Object.keys(schema.user!.fields)).toContain('last_organization_id')
    expect(Object.keys(schema.session!.fields)).toContain('active_organization_id')
    expect(names.filter((name) => !name.split('.').every((part) => snakeCase.test(part)))).toEqual([])
  })
})
