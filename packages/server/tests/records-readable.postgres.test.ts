import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, resource, type AccessContext } from '@protobase/schema'
import { anonymousSession } from '../src/anonymous'
import { recordReadable } from '../src/channels/record-readable'
import { readableKeys } from '../src/channels/records-readable'
import type { Deps } from '../src/deps'
import { buildRegistry } from '../src/registry'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../../test-support/postgres-database'

// The batched read of which records a caller may read, against the one-record read a channel join and a ticket use: the
// same answer for every record, from the row filter, soft delete, a record-level rule, a refused resource and a tenant.

const resources = [
  resource('rooms').table('rooms').fields({ id: f.integer().readOnly(), public: f.boolean().filterable(), deleted_at: f.timestamp().optional() }).primaryKey((r) => r.id).softDelete((r) => r.deleted_at),
  // Open boards are anyone's, team boards only where the name says so, closed ones no one's.
  resource('boards')
    .table('boards')
    .fields({ id: f.integer().readOnly(), kind: f.text(), name: f.text() })
    .primaryKey((r) => r.id)
    .access({ read: ({ record }: AccessContext) => ((record as { kind: string }).kind === 'open' ? true : (record as { kind: string }).kind === 'team' ? 'name = "lobby"' : false) }),
  resource('vaults').table('vaults').fields({ id: f.integer().readOnly() }).primaryKey((r) => r.id),
  resource('desks').table('desks').fields({ id: f.integer().readOnly(), org: f.text() }).primaryKey((r) => r.id).tenant((r) => r.org),
  // A rule that fails on a record it was not written for.
  resource('ledgers').table('ledgers').fields({ id: f.integer().readOnly(), kind: f.text() }).primaryKey((r) => r.id).access({ read: ({ record }: AccessContext) => {
    if ((record as { kind: string }).kind === 'broken') throw new Error('The rule cannot read this record')
    return true
  } }),
]

const roles = defineRoles<'rooms' | 'boards' | 'desks' | 'ledgers'>({
  anonymous: [
    { 'rooms.read': { fields: ['id'], filter: 'public = true' }, 'boards.read': { fields: ['id'] }, 'desks.read': { fields: ['id'] }, 'ledgers.read': { fields: ['id'] } },
  ],
})

const tables = `
create table rooms (id integer primary key, public boolean not null, deleted_at timestamptz);
create table boards (id integer primary key, kind text not null, name text not null);
create table vaults (id integer primary key);
create table desks (id integer primary key, org text not null);
create table ledgers (id integer primary key, kind text not null);
insert into rooms values (1, true, null), (2, false, null), (3, true, now());
insert into boards values (1, 'open', 'x'), (2, 'team', 'lobby'), (3, 'team', 'staff'), (4, 'closed', 'x');
insert into vaults values (1);
insert into desks values (1, 'a');
insert into ledgers values (1, 'fine'), (2, 'broken');
`

describe.skipIf(!(await postgresTemplateReady('empty')))('readableKeys on real Postgres', () => {
  let pg: PostgresDatabase
  let deps: Deps
  const registry = buildRegistry(resources)
  const entry = (name: string) => registry.find(name)!
  const keys = (...ids: number[]) => ids.map((id) => [id])
  const named = (...ids: number[]) => new Set(ids.map((id) => JSON.stringify([String(id)])))

  // The keys the one-record read finds readable, one read each.
  const oneByOne = async (resource: string, ids: number[]) => {
    const found: number[] = []
    for (const id of ids) if (await recordReadable(deps, anonymousSession(), { entry: entry(resource), key: [id], name: `${resource}/${id}` })) found.push(id)
    return named(...found)
  }

  beforeAll(async () => {
    pg = await openPostgresDatabase('empty')
    await pg.exec(tables)
    deps = { db: pg.db, registry, statementTimeoutMs, accessOptions: { roles }, settingsResources: new Set() } as unknown as Deps
  })

  afterAll(async () => {
    await pg?.close()
  })

  it('reads the row filter and soft delete as one record is read, and takes a missing key as not readable', async () => {
    const ids = [1, 2, 3, 4]
    const found = await readableKeys(deps, pg.db, anonymousSession(), entry('rooms'), keys(...ids))
    expect(found).toEqual(named(1))
    expect(found).toEqual(await oneByOne('rooms', ids))
  })

  it("runs a record-level rule on each record, checking the filters it answers in the database, as one record's read does", async () => {
    const ids = [1, 2, 3, 4, 5]
    const found = await readableKeys(deps, pg.db, anonymousSession(), entry('boards'), keys(...ids))
    expect(found).toEqual(named(1, 2))
    expect(found).toEqual(await oneByOne('boards', ids))
  })

  it('reads at most two statements for a resource, whatever the number of keys', async () => {
    const statements: string[] = []
    const counted = pg.db.withPlugin({ transformQuery: ({ node }) => (statements.push(node.kind), node), transformResult: async ({ result }) => result })
    await readableKeys(deps, counted, anonymousSession(), entry('boards'), keys(1, 2, 3, 4, 5))
    expect(statements).toHaveLength(2)
  })

  it('reads nothing of a resource the caller may not read, or of one scoped to a tenant the caller has none of', async () => {
    expect(await readableKeys(deps, pg.db, anonymousSession(), entry('vaults'), keys(1))).toEqual(new Set())
    expect(await oneByOne('vaults', [1])).toEqual(new Set())
    expect(await readableKeys(deps, pg.db, anonymousSession(), entry('desks'), keys(1))).toEqual(new Set())
    expect(await oneByOne('desks', [1])).toEqual(new Set())
  })

  it('fails with a rule that fails, rather than taking the record either way', async () => {
    await expect(readableKeys(deps, pg.db, anonymousSession(), entry('ledgers'), keys(1, 2))).rejects.toThrow('The rule cannot read this record')
  })

  it('fails with a read the database fails', async () => {
    const read = pg.db.transaction().execute(async (trx) => {
      await sql`alter table rooms rename to rooms_away`.execute(trx)
      return readableKeys(deps, trx, anonymousSession(), entry('rooms'), keys(1))
    })
    await expect(read).rejects.toThrow('"rooms" does not exist')
  })
})
