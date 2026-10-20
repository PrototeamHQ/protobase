import { describe, expect, it } from 'vitest'
import { appExtensions, createExtensions, sortExtensions } from './extensions'

describe('appExtensions', () => {
  it("leaves out the platform's own", () => {
    expect(
      appExtensions([
        { name: 'plpgsql', schema: 'pg_catalog' },
        { name: 'pg_graphql', schema: 'graphql' },
        { name: 'supabase_vault', schema: 'vault' },
        { name: 'pg_trgm', schema: 'extensions' },
        { name: 'pg_cron', schema: 'pg_catalog' },
      ]),
    ).toEqual([
      { name: 'pg_trgm', schema: 'extensions' },
      { name: 'pg_cron', schema: 'pg_catalog' },
    ])
  })
})

describe('sortExtensions', () => {
  it("sorts them by whether the project's database may create them", () => {
    const found = sortExtensions([{ name: 'pg_trgm', schema: 'extensions' }, { name: 'pg_cron', schema: 'pg_catalog' }], new Set(['pg_trgm']))
    expect(found).toEqual({ created: [{ name: 'pg_trgm', schema: 'extensions' }], leftOut: [{ name: 'pg_cron', schema: 'pg_catalog' }] })
  })
})

describe('createExtensions', () => {
  it('creates each in the schema it had', () => {
    expect(
      createExtensions([
        { name: 'uuid-ossp', schema: 'extensions' },
        { name: 'citext', schema: 'public' },
      ]),
    ).toBe('CREATE SCHEMA IF NOT EXISTS "extensions";\nCREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";\nCREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "public";\n')
  })

  it('makes no system schema', () => {
    expect(createExtensions([{ name: 'pg_cron', schema: 'pg_catalog' }])).toBe('CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";\n')
  })
})
