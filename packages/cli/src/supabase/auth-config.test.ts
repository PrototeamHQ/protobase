import { describe, expect, it } from 'vitest'
import { withSupabaseUsers } from './auth-config'

const configFile = `import { defineConfig } from '@protobase/config'

export default defineConfig({
  auth: {
    roles: ['admin'],
  },
})
`

describe('withSupabaseUsers', () => {
  it("adds the settings first in the config's auth", () => {
    expect(withSupabaseUsers(configFile, 'protobase.config.ts')).toBe(`import { defineConfig } from '@protobase/config'

export default defineConfig({
  auth: {
    // Supabase's own auth.users as the app's user table, written by \`protobase import supabase\`: every foreign key,
    // trigger and policy naming it keeps working. Its passwords are bcrypt hashes, its ids UUIDs, and its \`role\` the
    // Postgres role, so the app's roles go to a column of their own.
    users: { table: 'users', columns: { role: 'app_role' }, metadata: 'raw_user_meta_data' },
    passwordHashes: ['bcrypt'],
    generateUserId: 'uuid',
    roles: ['admin'],
  },
})
`)
  })

  it('adds an auth of the settings to a config without one, sign-in being on by default', () => {
    expect(withSupabaseUsers("export default { timezone: 'UTC' }\n", 'protobase.config.ts')).toBe(
      "export default { timezone: 'UTC', auth: { users: { table: 'users', columns: { role: 'app_role' }, metadata: 'raw_user_meta_data' }, passwordHashes: ['bcrypt'], generateUserId: 'uuid' } }\n",
    )
  })

  it('fails, naming the settings, unless it can see the config and its auth is an object', () => {
    expect(() => withSupabaseUsers('export default { auth: false }\n', 'protobase.config.ts')).toThrow(/protobase.config.ts must export a config with an `auth: \{ ... \}` object: .*"table":"users"/)
    expect(() => withSupabaseUsers("import project from './project'\nexport default project\n", 'protobase.config.ts')).toThrow('must export a config with an `auth')
  })
})
