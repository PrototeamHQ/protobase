import { describe, expect, it } from 'vitest'
import { appExtensions, createExtensions } from './extensions'

describe('appExtensions', () => {
  it("sorts the app's extensions by whether a database owner may create them, leaving out the platform's", () => {
    const found = appExtensions([
      { name: 'plpgsql', schema: 'pg_catalog', trusted: false },
      { name: 'pg_graphql', schema: 'graphql', trusted: false },
      { name: 'pg_trgm', schema: 'extensions', trusted: true },
      { name: 'pg_cron', schema: 'pg_catalog', trusted: false },
    ])
    expect(found).toEqual({ trusted: [{ name: 'pg_trgm', schema: 'extensions', trusted: true }], untrusted: [{ name: 'pg_cron', schema: 'pg_catalog', trusted: false }] })
  })
})

describe('createExtensions', () => {
  it('creates each in the schema it had', () => {
    expect(
      createExtensions([
        { name: 'uuid-ossp', schema: 'extensions', trusted: true },
        { name: 'citext', schema: 'public', trusted: true },
      ]),
    ).toBe('CREATE SCHEMA IF NOT EXISTS "extensions";\nCREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";\nCREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "public";\n')
  })
})
