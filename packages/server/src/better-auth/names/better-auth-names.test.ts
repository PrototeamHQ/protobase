import { getSchema } from 'better-auth/db'
import { describe, expect, it } from 'vitest'
import { betterAuthOptions, type CreateAuthOptions } from '../create-auth'
import { mcpAuthPlugins } from '../mcp/mcp-auth-plugins'
import { resolveMcp } from '../mcp/mcp-plugins'
import { resolveOperator } from '../operator-provider'
import { resolveOrganizations } from '../organizations/options'
import { roleDefinitions } from '../organizations/role-definitions'
import { resolvePersonalAccessTokens } from '../personal-access-tokens/options'
import { resolvePlatformSignIns } from '../platform-sign-in'
import { samlPlugin } from '../saml-plugin'
import { resolveSamlProviders } from '../saml-sign-in'
import { resolveNames, type TableNames } from './resolve-names'

// Each feature that brings tables or columns of its own: the store's names must be Better Auth's whichever are on.
const features = ['organizations', 'mcp', 'personalAccessTokens', 'personalMail', 'devices'] as const
type Feature = (typeof features)[number]

const combinations = features.reduce<Feature[][]>((sets, feature) => [...sets, ...sets.map((set) => [...set, feature])], [[]])

const baseURL = 'https://admin.example.com'

const optionsWith = (on: Feature[], tables?: TableNames) => {
  const options: CreateAuthOptions = {
    database: { dialect: undefined as never, type: 'postgres', schemaName: 'auth' },
    baseURL,
    secret: 'test-secret-test-secret-test-secret-1234',
    ...(tables && { tables }),
    ...(on.includes('personalMail') && { personalMail: ['gmail'], encryptOAuthTokens: true, socialProviders: { google: { clientId: 'id', clientSecret: 'secret' } } }),
  }
  const names = resolveNames({ schema: 'auth', ...(tables && { tables }) })
  return {
    names,
    options: betterAuthOptions(options, {
      names,
      roles: ['admin', 'user'],
      definitions: roleDefinitions(),
      mailer: { send: async () => ({}) },
      operator: resolveOperator({ issuer: 'https://id.operator.example', clientId: 'app', clientSecret: 'secret' }),
      // With SAML providers too, which live in config: the SSO plugin adds no table.
      samlPlugin,
      saml: resolveSamlProviders([{ id: 'okta', domains: ['example.com'], idp: { metadata: '<EntityDescriptor entityID="https://idp.example.com"/>' } }], []),
      platformSignIn: resolvePlatformSignIns(
        [
          { issuer: 'https://auth.example.com', clientId: 'app', clientSecret: 'secret' },
          ...(on.includes('devices') ? [{ issuer: 'https://devices.example.com', provider: 'devices', clientId: 'app', devices: true, tokenSignIn: true }] : []),
        ],
        'https://app.example.com',
      ),
      ...(on.includes('organizations') && { organizations: resolveOrganizations({}, roleDefinitions({ sales: 'Sales' }, { organizations: true })) }),
      ...(on.includes('mcp') && { mcp: resolveMcp(baseURL, true), mcpAuthPlugins }),
      ...(on.includes('personalAccessTokens') && { personalAccessTokens: resolvePersonalAccessTokens({ prefix: 'test_' }) }),
    }),
  }
}

// Every table Better Auth reads, with its columns, as the database names them.
const betterAuthTables = (options: ReturnType<typeof optionsWith>['options']) =>
  Object.fromEntries(Object.entries(getSchema(options)).map(([table, { fields }]) => [table, Object.keys(fields).sort()]))

// The same of the store's names, for the tables Better Auth reads: every column a module that is on declares.
const modelTables = ({ names }: ReturnType<typeof optionsWith>, tables: string[]) =>
  Object.fromEntries(Object.values(names.tables).filter(({ name }) => tables.includes(name)).map(({ name, columns }) => [name, Object.values(columns).map((column) => column.name).sort()]))

// Every table and column under another name: each table with a `t_` before it, each column with a `c_`.
const everyName = (): TableNames =>
  Object.fromEntries(
    Object.values(resolveNames({ schema: undefined }).tables).map(({ internal, columns }) => [internal, { name: `t_${internal}`, columns: Object.fromEntries(Object.keys(columns).map((column) => [column, `c_${column}`])) }]),
  )

describe("the store's names", () => {
  it.each(combinations.map((on) => [on.join(', ') || 'no feature', on] as const))("are Better Auth's tables and columns with %s on", (_, on) => {
    for (const tables of [undefined, everyName()]) {
      const resolved = optionsWith(on, tables)
      const found = betterAuthTables(resolved.options)
      const declared = modelTables(resolved, Object.keys(found))
      expect(Object.keys(declared).sort()).toEqual(Object.keys(found).sort())
      // A column of a feature that is off, such as the user's last organization, is in the store but not in Better Auth's tables.
      for (const [table, columns] of Object.entries(found)) expect(declared[table], table).toEqual(expect.arrayContaining(columns))
    }
  })

  it("are every column of Better Auth's tables with every feature on", () => {
    for (const tables of [undefined, everyName()]) {
      const resolved = optionsWith([...features], tables)
      const found = betterAuthTables(resolved.options)
      expect(modelTables(resolved, Object.keys(found))).toEqual(found)
      // The record of migrations is the store's alone.
      expect(Object.keys(found).length).toBe(Object.keys(resolved.names.tables).length - 1)
    }
  })

  it('keep the built-in names without a config: snake_case, as the migrations make them', () => {
    const found = betterAuthTables(optionsWith([...features]).options)
    expect(Object.keys(found)).toEqual(expect.arrayContaining(['user', 'session', 'two_factor', 'sign_in_policy', 'staff_sign_in', 'member', 'oauth_client', 'personal_access_token', 'mail_sender', 'refused_account', 'device_session']))
    expect(found.member).toEqual(expect.arrayContaining(['organization_id', 'user_id', 'app_roles']))
    expect(found.user).toEqual(expect.arrayContaining(['last_organization_id', 'two_factor_enabled', 'email_confirmed_at']))
  })
})

describe('the names of one auth instance', () => {
  it('stay its own when another instance in the same process names the tables otherwise', () => {
    const user = (options: ReturnType<typeof optionsWith>['options']) => getSchema(options).people?.fields ?? {}
    const first = optionsWith([], { user: { name: 'people', columns: { role: 'app_role', banned: 'is_banned' } } })
    optionsWith([], { user: { name: 'people', columns: { role: 'other_role' } } })
    expect(Object.keys(user(first.options))).toEqual(expect.arrayContaining(['app_role', 'is_banned', 'two_factor_enabled']))
    expect(Object.keys(user(first.options))).not.toContain('other_role')
  })
})
