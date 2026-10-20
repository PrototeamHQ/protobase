import { describe, expect, it } from 'vitest'
import { withSupabaseUsers } from './auth-config'

const authFile = `import { createAuth } from '@protobase/server'

export const auth = createAuth({
  database: pool,
  secret,
})
`

describe('withSupabaseUsers', () => {
  it("spreads the options into the file's createAuth call and imports them", () => {
    expect(withSupabaseUsers(authFile, 'auth/auth.ts')).toBe(`import { supabaseUsers } from './supabase-users'
import { createAuth } from '@protobase/server'

export const auth = createAuth({
  ...supabaseUsers,
  database: pool,
  secret,
})
`)
  })

  it('fails, naming the options, unless the file calls createAuth once', () => {
    expect(() => withSupabaseUsers('export const auth = make()\n', 'auth/auth.ts')).toThrow(/auth\/auth.ts must call `createAuth\(\{` once, it does 0 times: .*"table":"users"/)
    expect(() => withSupabaseUsers(`${authFile}${authFile}`, 'auth/auth.ts')).toThrow('it does 2 times')
  })
})
