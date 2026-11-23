import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { channelMembers, coMembers, memberships } from '../src/relay/members-sql'
import { checkRealtimeMembers, realtimeMembersMigration } from '../src/relay/realtime-members-schema'
import { listedTable } from '../src/relay/realtime-members-sql'
import { relayModels } from '../src/relay/relay-models'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// Direct messages whose records list their members, as a conversation page's `members` derives the relay's channels:
// the migration fills `realtime.members` from the records already there, its triggers keep it, and tickets, notice
// audiences and presence co-members read it.
const directs = resource('directs').table('directs').fields({ id: f.integer(), members: f.json(), deleted_at: f.timestamp().optional() }).primaryKey((r) => r.id).softDelete((r) => r.deleted_at).live().toModel()
const models = relayModels({ channels: { directs: { members: { field: 'members' } } } }, [directs])
const listed = [listedTable(models.channels.get('directs')!.listed!)]

let db: Kysely<any>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  db = pg.db
  // Its key is checked at the end of each statement, so one statement can swap two records' keys.
  await pg.exec(`create table directs (id integer primary key deferrable initially deferred, members jsonb not null, deleted_at timestamptz, status text);
insert into directs values (1, '["ann", "bob"]', null), (2, '["ann"]', '2026-07-01');`)
  await pg.exec((await realtimeMembersMigration(db, listed))!)
})
afterAll(async () => { await db.destroy() })

const rows = async () => (await sql<{ channel_key: string; user_id: string }>`select channel_key, user_id from realtime.members where resource = 'directs' order by channel_key, user_id`.execute(db)).rows.map((row) => `${row.channel_key}:${row.user_id}`)

describe('realtime.members', () => {
  it('is current once its migration ran, filled from the live records already there', async () => {
    expect(await realtimeMembersMigration(db, listed)).toBeUndefined()
    await expect(checkRealtimeMembers(db, listed, 'protobase migration')).resolves.toBeUndefined()
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

  it('refuses a partitioned channel table, whose partitions it could not keep', async () => {
    await sql`create table rooms (id integer, members jsonb) partition by range (id)`.execute(db)
    const rooms = { resource: 'rooms', table: '"rooms"', key: 'id', members: 'members', deleted: '' }
    await expect(realtimeMembersMigration(db, [...listed, rooms])).rejects.toThrow('realtime.members cannot keep the members of "rooms": a partitioned table')
  })

  it('empties a truncated table and refuses to start once a trigger is off or gone', async () => {
    await sql`truncate directs`.execute(db)
    expect(await rows()).toEqual([])
    await sql`alter table directs disable trigger realtime_members`.execute(db)
    await expect(checkRealtimeMembers(db, listed, 'protobase migration')).rejects.toThrow('the triggers that keep it on "directs"')
    await sql`drop trigger realtime_members on directs`.execute(db)
    await expect(checkRealtimeMembers(db, listed, 'protobase migration')).rejects.toThrow('the triggers that keep it on "directs"')
  })
})
