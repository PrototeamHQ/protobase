import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { notDefaultOrganization } from './not-default'

const db = new Kysely<unknown>({ dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(), createIntrospector: (kysely) => new PostgresIntrospector(kysely), createQueryCompiler: () => new PostgresQueryCompiler() } })
const uuids = { advanced: { database: { generateId: 'uuid' as const } } }

describe('notDefaultOrganization', () => {
  it('leaves out a uuid default written in upper case as Postgres prints it', () => {
    const query = notDefaultOrganization(uuids, '0B5E7C1A-2D3F-4A5B-8C6D-7E8F9A0B1C2D').compile(db)
    expect(query.sql).toBe('and cast(o.id as text) <> $1')
    expect(query.parameters).toEqual(['0b5e7c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d'])
  })

  it('keeps the case of a text default', () => {
    expect(notDefaultOrganization({}, 'Main').compile(db).parameters).toEqual(['Main'])
  })

  it('is nothing without a configured default', () => {
    expect(notDefaultOrganization(uuids, undefined).compile(db).sql).toBe('')
  })
})
