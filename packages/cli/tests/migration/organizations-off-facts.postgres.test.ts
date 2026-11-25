import { afterEach, describe, expect, it } from 'vitest'
import { settingsStoreNames } from '@protobase/server/internal'
import { organizationsOffFacts } from '../../src/migration/snapshot/organizations-off-facts'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../../test-support/postgres-database'

// What goes dark as organizations turn off, read from a migrated auth store whose default organization is `default`.

const opened: PostgresDatabase[] = []
afterEach(async () => {
  await Promise.all(opened.splice(0).map((database) => database.close()))
})

// The template's store, with Ana in the default organization and Bo in Acme, and a token of each.
const store = async () => {
  const database = await openPostgresDatabase('auth')
  opened.push(database)
  await database.exec(`
    insert into organization (id, name, slug, created_at) values ('acme', 'Acme', 'acme', now());
    insert into "user" (id, name, email, email_verified, created_at, updated_at) values ('ana', 'Ana', 'ana@example.com', true, now(), now()), ('bo', 'Bo', 'bo@example.com', true, now(), now());
    insert into member (id, organization_id, user_id, role, created_at) values ('m1', 'default', 'ana', 'member', now()), ('m2', 'acme', 'bo', 'member', now());
    insert into personal_access_token (id, user_id, name, token_hash, role, organization_id, created_at) values ('t1', 'ana', 'Ana''s', 'h1', 'sales', 'default', now()), ('t2', 'bo', 'Bo''s', 'h2', 'sales', 'acme', now());
  `)
  return database
}

describe.skipIf(!(await postgresTemplateReady('auth')))('the facts of turning organizations off', () => {
  it('counts the people outside the default organization and the tokens made outside it', async () => {
    const database = await store()
    const names = settingsStoreNames({ schema: 'public', personalAccessTokens: { prefix: 'app_' } })
    expect(await organizationsOffFacts(database.url, names, 'default')).toEqual({ outside: 1, otherTokens: 1 })
  })

  it('counts the tokens a personal access tokens module turned off keeps, and none once the store has no token table', async () => {
    const database = await store()
    const names = settingsStoreNames({ schema: 'public' })
    expect(await organizationsOffFacts(database.url, names, 'default')).toEqual({ outside: 1, otherTokens: 1 })
    await database.exec('drop table personal_access_token')
    expect(await organizationsOffFacts(database.url, names, 'default')).toEqual({ outside: 1, otherTokens: 0 })
  })

  it("counts every token whose table never had an organization's column", async () => {
    const database = await store()
    await database.exec('alter table personal_access_token drop column organization_id')
    expect(await organizationsOffFacts(database.url, settingsStoreNames({ schema: 'public' }), 'default')).toEqual({ outside: 1, otherTokens: 2 })
  })

  it("offers the store's only organization when it is not the default", async () => {
    const database = await openPostgresDatabase('auth')
    opened.push(database)
    expect(await organizationsOffFacts(database.url, settingsStoreNames({ schema: 'public' }), 'main')).toEqual({ outside: 0, otherTokens: 0, only: { id: 'default', name: 'Default', slug: 'default' } })
  })
})
