import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { channelMembers, coMembers, memberships } from '../src/relay/members-sql'
import { listedTable, listedTableSql, membersFunctionsSql, membersTableSql, type ListedTable } from '../src/relay/realtime-members-sql'
import { relayModule } from '../src/relay/relay-module'
import { relayModels } from '../src/relay/relay-models'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// Direct messages whose records list their members, as a conversation page's `members` derives the relay's channels:
// the migration fills `realtime.members` from the records already there, its triggers keep it, and tickets, notice
// audiences and presence co-members read it.
const directs = resource('directs').table('directs').fields({ id: f.integer(), members: f.json(), deleted_at: f.timestamp().optional() }).primaryKey((r) => r.id).softDelete((r) => r.deleted_at).live().toModel()
const models = relayModels({ channels: { directs: { members: { field: 'members' } } } }, [directs])
const listed = listedTable(models.channels.get('directs')!.listed!)

// The relay module's input for listed tables, by resource; the app's database has no sessions table here.
const input = (tables: Record<string, ListedTable>) => ({
  names: { sessions: '"session"' },
  resources: { members: Object.fromEntries(Object.entries(tables).map(([resource, table]) => [resource, { table: { name: table.table.replaceAll('"', '') }, input: table }])) },
})
const digest = async (tables: Record<string, ListedTable>, resource: string) => (await relayModule.read(db, input(tables)))?.resources?.members?.[resource]?.digest
const statements = (list: readonly string[]) => `${list.join(';\n')};`

let db: Kysely<any>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  db = pg.db
  // Its key is checked at the end of each statement, so one statement can swap two records' keys.
  await pg.exec(`create table directs (id integer primary key deferrable initially deferred, members jsonb not null, deleted_at timestamptz, status text);
insert into directs values (1, '["ann", "bob"]', null), (2, '["ann"]', '2026-07-01');`)
  await pg.exec(statements([...membersTableSql, ...membersFunctionsSql, ...listedTableSql(listed)]))
})
afterAll(async () => { await db.destroy() })

const rows = async () => (await sql<{ channel_key: string; user_id: string }>`select channel_key, user_id from realtime.members where resource = 'directs' order by channel_key, user_id`.execute(db)).rows.map((row) => `${row.channel_key}:${row.user_id}`)

describe('realtime.members', () => {
  it('reads as current once its statements ran, filled from the live records already there', async () => {
    const model = await relayModule.read(db, input({ directs: listed }))
    expect(model).toMatchObject({ lastStep: 1, replaceables: { members: 3 } })
    expect(model!.resources!.members!.directs!.digest).toEqual(expect.stringMatching(/.+/))
    expect(await rows()).toEqual(['1:ann', '1:bob'])
  })

  it('follows inserts, members array changes, soft deletes, undeletes and deletes', async () => {
    await sql`insert into directs values (3, '["carl", "ann", "ann", null]', null)`.execute(db)
    expect(await rows()).toEqual(['1:ann', '1:bob', '3:ann', '3:carl'])
    await sql`update directs set members = '["bob", "dora"]' where id = 1`.execute(db)
    await sql`update directs set deleted_at = null where id = 2`.execute(db)
    await sql`update directs set deleted_at = '2026-07-02' where id = 3`.execute(db)
    expect(await rows()).toEqual(['1:bob', '1:dora', '2:ann'])
    await sql`delete from directs where id = 2`.execute(db)
    expect(await rows()).toEqual(['1:bob', '1:dora'])
  })

  it("serves a person's channels, a channel's members and who shares one with whom", async () => {
    await sql`insert into directs values (4, '["dora", "eve"]', null)`.execute(db)
    expect((await memberships(db, models, 'dora')).sort()).toEqual(['directs/1', 'directs/4'])
    expect(await channelMembers(db, models, ['directs/1', 'directs/9'])).toEqual(new Map([['directs/1', ['bob', 'dora']]]))
    const shared = await coMembers(db, models, ['eve'])
    expect(shared.get('eve')?.sort()).toEqual(['dora', 'eve'])
  })

  it('reads a person and a channel through its indexes', async () => {
    // A few rows read faster in a scan, so the plan is asked for as a table of any size would get it.
    const plan = (query: string) =>
      db.transaction().execute(async (trx) => {
        await sql`set local enable_seqscan = off`.execute(trx)
        return JSON.stringify((await sql.raw(`explain (costs off) ${query}`).execute(trx)).rows)
      })
    expect(await plan(`select channel_key from realtime.members where user_id = 'dora' and resource = 'directs'`)).toContain('members_by_user')
    expect(await plan(`select user_id from realtime.members where resource = 'directs' and channel_key = '1'`)).toContain('members_pkey')
  })

  it('keeps each key its members when one statement swaps two records that list the same person', async () => {
    await sql`insert into directs values (5, '["fay", "gus"]', null), (6, '["fay"]', null)`.execute(db)
    await sql`update directs set id = case id when 5 then 6 else 5 end where id in (5, 6)`.execute(db)
    expect((await rows()).filter((row) => /^[56]:/.test(row))).toEqual(['5:fay', '6:fay', '6:gus'])
  })

  it('follows members a trigger before the write changes, whatever column the update names', async () => {
    await sql.raw(`create function close_direct() returns trigger language plpgsql as $$ begin if new.status = 'closed' then new.members := '[]'; end if; return new; end $$;
create trigger close_direct before update on directs for each row execute function close_direct()`).execute(db)
    await sql`update directs set status = 'closed' where id = 6`.execute(db)
    expect((await rows()).filter((row) => /^[56]:/.test(row))).toEqual(['5:fay'])
  })

  it('empties a truncated table, and reads its triggers to be written again once one is off, and as gone once dropped', async () => {
    await sql`truncate directs`.execute(db)
    expect(await rows()).toEqual([])
    await sql`alter table directs disable trigger realtime_members`.execute(db)
    expect(await digest({ directs: listed }, 'directs')).toBe('')
    await sql`drop trigger realtime_members on directs`.execute(db)
    expect(await digest({ directs: listed }, 'directs')).toBeUndefined()
  })

  it("keeps a partitioned table: a truncated partition's siblings keep their members, and each partition's triggers are read", async () => {
    await sql.raw(`create table rooms (id integer, members jsonb) partition by range (id);
create table rooms_a partition of rooms for values from (0) to (100);
create table rooms_b partition of rooms for values from (100) to (200)`).execute(db)
    const rooms = { resource: 'rooms', table: '"rooms"', key: 'id', members: 'members', deleted: '' }
    const roomRows = async () => (await sql<{ channel_key: string; user_id: string }>`select channel_key, user_id from realtime.members where resource = 'rooms' order by channel_key, user_id`.execute(db)).rows.map((row) => `${row.channel_key}:${row.user_id}`)
    await sql.raw(statements(listedTableSql(rooms))).execute(db)
    await sql`insert into rooms values (1, '["ann"]'), (150, '["bob"]')`.execute(db)
    await sql`update rooms set members = '["bob", "cy"]' where id = 150`.execute(db)
    expect(await roomRows()).toEqual(['1:ann', '150:bob', '150:cy'])
    await sql`truncate rooms_a`.execute(db)
    expect(await roomRows()).toEqual(['150:bob', '150:cy'])
    expect(await digest({ rooms }, 'rooms')).toEqual(expect.stringMatching(/.+/))

    await sql`alter table rooms_b disable trigger realtime_members`.execute(db)
    expect(await digest({ rooms }, 'rooms')).toBe('')
    await sql`alter table rooms_b enable trigger realtime_members`.execute(db)
    await sql`create table rooms_c partition of rooms for values from (200) to (300)`.execute(db)
    expect(await digest({ rooms }, 'rooms')).toBe('')
    await sql.raw(statements(listedTableSql(rooms))).execute(db)
    expect(await digest({ rooms }, 'rooms')).toEqual(expect.stringMatching(/.+/))
    await expect(sql.raw(statements(listedTableSql({ ...rooms, table: '"rooms_a"' }))).execute(db)).rejects.toThrow('a partition or a table in an inheritance tree')
  })

  it("reads a resource's triggers left on a table it no longer has apart from those on its own, so they are dropped", async () => {
    const rooms = { resource: 'rooms', table: '"rooms"', key: 'id', members: 'members', deleted: '' }
    await sql.raw(`create table rooms_old (id integer primary key, members jsonb); ${statements(listedTableSql({ ...rooms, table: '"rooms_old"' }))}`).execute(db)
    const entries = (await relayModule.read(db, input({ rooms })))!.resources!.members!
    expect(entries.rooms!.digest).toEqual(expect.stringMatching(/.+/))
    expect(entries['rooms on rooms_old']).toMatchObject({ digest: '', table: { schema: 'public', name: 'rooms_old' } })
    await sql.raw(relayModule.resourceReplaceables[0]!.drop!({}, { schema: 'public', name: 'rooms_old' }, undefined, 'rooms on rooms_old')).execute(db)
  })

  it("drops a table's triggers, on its partitions too, and the members of the resource they kept", async () => {
    await sql.raw(relayModule.resourceReplaceables[0]!.drop!({}, { name: 'rooms' }, undefined, 'rooms')).execute(db)
    expect((await sql<{ count: number }>`select count(*)::int as count from pg_trigger where tgname like 'realtime_members%' and tgrelid::regclass::text like 'rooms%'`.execute(db)).rows[0]!.count).toBe(0)
    expect((await sql<{ count: number }>`select count(*)::int as count from realtime.members where resource = 'rooms'`.execute(db)).rows[0]!.count).toBe(0)
  })
})
