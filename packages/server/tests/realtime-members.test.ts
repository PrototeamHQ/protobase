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
  await pg.exec(`create table directs (id integer primary key, members jsonb not null, deleted_at timestamptz);
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

  it('empties a truncated table and refuses to start once a trigger is gone', async () => {
    await sql`truncate directs`.execute(db)
    expect(await rows()).toEqual([])
    await sql`drop trigger realtime_members on directs`.execute(db)
    await expect(checkRealtimeMembers(db, listed, 'protobase migration')).rejects.toThrow('the triggers that keep it on "directs"')
  })
})
