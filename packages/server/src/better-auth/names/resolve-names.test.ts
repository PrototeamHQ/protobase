import { describe, expect, it } from 'vitest'
import { resolveNames } from './resolve-names'

describe('resolveNames', () => {
  it('names every table and column as its module declares it, in the schema', () => {
    const names = resolveNames({ schema: 'auth' })
    const session = names.table('session')
    expect(String(session)).toBe('"auth"."session"')
    expect(session.columns.user_id).toMatchObject({ schema: 'auth', table: 'session', column: 'user_id', field: 'userId' })
    expect(session.fields.expiresAt!.name).toBe('expires_at')
    expect(session.index('session_user_id_idx').name).toBe('session_user_id_idx')
    expect(names.model('twoFactor')!.name).toBe('two_factor')
    expect(names.table('sign_in_policy').columns.email_code.attribute).toEqual({ type: 'string', required: true })
  })

  it('gives the columns other modules add to a table, such as the user table', () => {
    const user = resolveNames({ schema: undefined }).table('user')
    expect(Object.keys(user.columns)).toEqual(expect.arrayContaining(['email', 'two_factor_enabled', 'last_organization_id']))
    expect(user.module).toBe('auth')
  })

  it('says which tables hold rows of one organization', () => {
    const { tables } = resolveNames({ schema: undefined })
    expect(Object.values(tables).filter(({ scope }) => scope === 'organization').map(({ internal }) => internal)).toEqual(['member', 'invitation', 'personal_access_token'])
  })

  it('takes a prefix, a table name and column names, keeping the rest', () => {
    const names = resolveNames({ schema: 'auth', tables: { prefix: 'app_', user: { name: 'people', columns: { role: 'app_role' } }, session: { columns: { user_id: 'person_id' } } } })
    expect(names.table('user').name).toBe('people')
    expect(names.table('user').columns.role.name).toBe('app_role')
    expect(names.table('user').columns.email.name).toBe('email')
    expect(names.table('session').name).toBe('app_session')
    expect(names.table('session').columns.user_id.name).toBe('person_id')
    expect(names.table('session').index('session_user_id_idx').name).toBe('app_session_user_id_idx')
    expect(names.table('auth_migrations').name).toBe('app_auth_migrations')
    expect(names.table('user').index('user_name_trgm_idx').name).toBe('people_name_trgm_idx')
  })

  it('shortens a long generated name with a stable hash, and refuses a long configured one', () => {
    const prefix = 'a_rather_long_prefix_for_every_table_of_the_store_'
    const long = resolveNames({ schema: undefined, tables: { prefix } }).table('oauth_client_resource')
    expect(Buffer.byteLength(long.name)).toBe(63)
    expect(long.name).toMatch(/_[0-9a-f]{8}$/)
    expect(resolveNames({ schema: undefined, tables: { prefix } }).table('oauth_client_resource').name).toBe(long.name)
    expect(Buffer.byteLength(long.index('oauth_client_resource_client_id_resource_id_uidx').name)).toBe(63)
    expect(() => resolveNames({ schema: undefined, tables: { session: { name: 's'.repeat(64) } } })).toThrow(/^auth\.tables\.session\.name "s{64}" is 64 bytes/)
    expect(() => resolveNames({ schema: undefined, tables: { session: { columns: { token: 't'.repeat(64) } } } })).toThrow(/^auth\.tables\.session\.columns\.token "t{64}" is 64 bytes/)
  })

  it('refuses a table or column the store has not, and id', () => {
    expect(() => resolveNames({ schema: undefined, tables: { sessions: {} } as never })).toThrow(/^auth\.tables names "sessions", which is not a table of the auth store: user, session/)
    expect(() => resolveNames({ schema: undefined, tables: { session: { columns: { user: 'x' } } } as never })).toThrow(/^auth\.tables\.session\.columns names "user", which is not a column of session: expires_at/)
    expect(() => resolveNames({ schema: undefined, tables: { session: { columns: { id: 'session_id' } } } as never })).toThrow('auth.tables.session.columns names id, which keeps its name')
  })

  it('refuses one name for two tables, a table and an index, or two columns of one', () => {
    expect(() => resolveNames({ schema: undefined, tables: { member: { name: 'session' } } })).toThrow('auth.tables gives two tables, or a table and an index, the name "session" twice')
    expect(() => resolveNames({ schema: undefined, tables: { account: { name: 'session_user_id_idx' } } })).toThrow('auth.tables gives two tables, or a table and an index, the name "session_user_id_idx" twice')
    expect(() => resolveNames({ schema: undefined, tables: { session: { columns: { token: 'user_id' } } } })).toThrow('auth.tables gives two columns of session the name "user_id" twice')
    expect(() => resolveNames({ schema: undefined, tables: { session: { columns: { token: 'id' } } } })).toThrow('the name "id" twice')
  })

  it('resolves only the modules that are on, refusing one on without one it requires', () => {
    const names = resolveNames({ schema: undefined, modules: ['auth', 'passkeys'] })
    expect(Object.keys(names.tables)).toEqual(['user', 'session', 'account', 'verification', 'jwks', 'auth_migrations', 'auth_steps', 'passkey'])
    expect(Object.keys(names.table('user').columns)).not.toContain('two_factor_enabled')
    expect(() => names.table('member')).toThrow('The auth store has no member table: its module is off')
    expect(() => resolveNames({ schema: undefined, modules: ['passkeys'] })).toThrow('The passkeys module is on while auth, which it requires, is off')
  })
})
