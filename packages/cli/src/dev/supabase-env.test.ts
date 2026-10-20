import { describe, expect, it } from 'vitest'
import { setMissing, supabaseEnv } from './supabase-env'

const url = 'http://localhost:5173'
const databaseUrl = 'postgres://app@localhost/app'

describe('supabaseEnv', () => {
  it("gives Supabase's names to the app's URL, database, key set and keys", () => {
    expect(supabaseEnv({ url, databaseUrl, keys: { publishable: 'sb_publishable_1', secret: 'sb_secret_1' }, withAuth: true })).toEqual({
      SUPABASE_URL: 'http://localhost:5173/api/sb',
      SUPABASE_DB_URL: databaseUrl,
      SUPABASE_JWKS_URL: 'http://localhost:5173/api/sb/auth/v1/.well-known/jwks.json',
      SUPABASE_ANON_KEY: 'sb_publishable_1',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1',
      SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_1"}',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_1',
      SUPABASE_SECRET_KEY: 'sb_secret_1',
      SUPABASE_SECRET_KEYS: '{"default":"sb_secret_1"}',
    })
  })

  it('leaves out the key set without auth and the keys the app lacks', () => {
    expect(supabaseEnv({ url, databaseUrl, keys: {}, withAuth: false })).toEqual({ SUPABASE_URL: 'http://localhost:5173/api/sb', SUPABASE_DB_URL: databaseUrl })
  })
})

describe('setMissing', () => {
  it("keeps the developer's own value", () => {
    const env: Record<string, string | undefined> = { SUPABASE_URL: 'https://mine.example' }
    setMissing(env, { SUPABASE_URL: url, SUPABASE_DB_URL: databaseUrl })
    expect(env).toEqual({ SUPABASE_URL: 'https://mine.example', SUPABASE_DB_URL: databaseUrl })
  })
})
