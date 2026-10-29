import { sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { createAdmin } from '../src/index'
import { rosters } from '../src/calls/call-reads'
import { sqlCallStore } from '../src/calls/calls-store'
import { callsSchemaSql } from '../src/calls/calls-sql'
import { ringsOf, startRings, stopEndedRings, stopRing, writeRingNotices } from '../src/calls/rings-sql'
import { noticesAfter, noticesTableSql } from '../src/live/notices-sql'
import { signTestToken, testAuthenticator } from '../../../test-support/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// The calls schema's rules on Postgres, where admissions, removals and ends race for real: a call's row lock makes them
// come one after the other. And the record's calls as its readers get them, through the API's access checks.

const meetings = resource('meetings')
  .table('meetings')
  .fields({ id: f.integer().readOnly(), owner_id: f.text().readOnly(), title: f.text() })
  .primaryKey((r) => r.id)
  .owner((r) => r.owner_id)
const roles = defineRoles<'meetings'>({ member: ['meetings.read.own'] })

const record = { resource: 'meetings', key: '1' }
const joining = (member: string, more: { maxMembers?: number; resume?: { call: string; tracks: [] } } = {}) => ({ record, member, process: '11111111-1111-1111-1111-111111111111', maxMembers: 8, maxMinutes: 60, ...more })

describe.skipIf(!(await postgresTemplateReady('empty')))('calls on records, on Postgres', () => {
  let database: PostgresDatabase
  let store: ReturnType<typeof sqlCallStore>

  beforeAll(async () => {
    database = await openPostgresDatabase('empty')
    await database.exec(`${callsSchemaSql};
      create schema changes; ${noticesTableSql('changes')};
      create table meetings (id integer primary key, owner_id text not null, title text not null);
      insert into meetings values (1, 'alice', 'Standup'), (2, 'bob', 'Retro');`)
    store = sqlCallStore(database.db, 10_000)
  })
  afterAll(async () => {
    await database?.close()
  })
  beforeEach(async () => {
    await database.exec('truncate calls.signals; truncate calls.rings, calls.members, calls.calls; truncate changes.notices')
  })

  const callOf = async (member: string, more = {}) => {
    const admitted = await store.admit(joining(member, more))
    if ('refused' in admitted) throw new Error(`${member} was refused: ${admitted.refused}`)
    return admitted
  }
  const present = async (call: string) => (await rosters(database.db, [call])).get(call)!.members.map((member) => member.member).sort()

  describe('rings', () => {
    it('tells whether a join started the call', async () => {
      expect((await callOf('alice')).started).toBe(true)
      expect((await callOf('bob')).started).toBe(false)
    })

    it('rings each user once per call, until they stop it or the call ends, and tells their pages in order', async () => {
      const { call } = await callOf('alice')
      expect(await startRings(database.db, call, ['bob', 'carol'], { title: 'Alice is calling', body: null }, 30)).toEqual(['bob', 'carol'])
      expect(await startRings(database.db, call, ['bob'], { title: 'Again', body: null }, 30)).toEqual([])
      const [rung] = await ringsOf(database.db, 'bob')
      expect(rung).toMatchObject({ call, resource: 'meetings', key: '1', started_by: 'alice', title: 'Alice is calling', body: null })
      expect(rung!.remaining_ms).toBeGreaterThan(28_000)
      expect(await stopRing(database.db, call, 'bob')).toBe(true)
      expect(await stopRing(database.db, call, 'bob')).toBe(false)
      expect(await ringsOf(database.db, 'bob')).toEqual([])
      expect(await stopEndedRings(database.db)).toEqual([])
      await store.leave((await callOf('alice')).row, '11111111-1111-1111-1111-111111111111')
      expect(await stopEndedRings(database.db)).toEqual(['carol'])
      expect(await ringsOf(database.db, 'carol')).toEqual([])
      await writeRingNotices(database.db, 'changes', ['bob', 'carol'])
      expect((await noticesAfter(database.db, 'changes', '0', 10)).map((notice) => [notice.resource, notice.key])).toEqual([['$rings', 'bob'], ['$rings', 'carol']])
    })

    it('rings no more once the ring is over', async () => {
      const { call } = await callOf('alice')
      await startRings(database.db, call, ['bob'], { title: 'Alice is calling', body: 'Standup' }, 30)
      await database.exec(`update calls.rings set until = now() - interval '1 second'`)
      expect(await ringsOf(database.db, 'bob')).toEqual([])
    })
  })

  describe('the size of a call', () => {
    it('admits exactly the limit of joins that come at once, and refuses the rest as full', async () => {
      const results = await Promise.all(Array.from({ length: 12 }, (_, index) => store.admit(joining(`m${index}`))))
      expect(results.filter((result) => 'refused' in result)).toEqual(Array.from({ length: 4 }, () => ({ refused: 'full' })))
      const calls = new Set(results.flatMap((result) => ('call' in result ? [result.call] : [])))
      expect(calls.size).toBe(1)
      expect(await present([...calls][0]!)).toHaveLength(8)
    })
  })

  describe('removing a member', () => {
    it('keeps them out, however their join and the removal race', async () => {
      for (let round = 0; round < 5; round++) {
        await database.exec('truncate calls.rings, calls.members, calls.calls')
        const { call } = await callOf('ann')
        await Promise.all([store.admit(joining('bob')), store.remove(call, 'bob')])
        // Either the join came first and the removal took bob out, or the removal was kept and the join refused.
        expect(await present(call)).toEqual(['ann'])
        const [item] = (await store.recordCalls([record])).get(`meetings\u0000${'1'}`)!
        expect(item!.removed.map((removed) => removed.member)).toContain('bob')
      }
    })

    it('refuses their resume and their join once removed', async () => {
      const { call } = await callOf('ann')
      await callOf('bob')
      expect(await store.remove(call, 'bob')).toBe(true)
      expect(await store.admit(joining('bob', { resume: { call, tracks: [] } }))).toEqual({ refused: 'removed' })
      expect(await store.admit(joining('bob'))).toEqual({ refused: 'removed' })
      expect(await present(call)).toEqual(['ann'])
    })

    it('changes nothing of another call, nor of a call that ended or that does not exist', async () => {
      const { call } = await callOf('ann')
      const other = await store.admit({ ...joining('bob'), record: { resource: 'meetings', key: '2' } })
      if ('refused' in other) throw new Error('bob was refused')
      expect(await store.remove(call, 'bob')).toBe(false)
      expect(await present(other.call)).toEqual(['bob'])
      expect(await store.remove(crypto.randomUUID(), 'bob')).toBe(false)
      expect(await store.remove('not a call', 'bob')).toBe(false)
      expect(await present(other.call)).toEqual(['bob'])
    })
  })

  describe('the end of a call', () => {
    it('comes with its last member leaving; a resume of it is refused, and the next join starts another', async () => {
      const { call, row } = await callOf('ann')
      await store.leave(row, joining('ann').process)
      expect((await rosters(database.db, [call])).get(call)!.ended).toBe(true)
      expect(await store.admit(joining('ann', { resume: { call, tracks: [] } }))).toEqual({ refused: 'ended' })
      const next = await callOf('ann')
      expect(next.call).not.toBe(call)
    })

    it('does not come with a leave of a member another process took over', async () => {
      const { call, row } = await callOf('ann')
      await store.admit({ ...joining('ann'), process: '22222222-2222-2222-2222-222222222222' })
      await store.leave(row, joining('ann').process)
      expect(await present(call)).toEqual(['ann'])
    })

    it('comes at its last minute, and a resume of it is refused', async () => {
      const { call } = await callOf('ann')
      await sql`update calls.calls set ends_at = now() - interval '1 second' where id = ${call}::uuid`.execute(database.db)
      await store.sweep()
      expect((await rosters(database.db, [call])).get(call)).toEqual({ ended: true, members: [] })
      expect(await store.admit(joining('ann', { resume: { call, tracks: [] } }))).toEqual({ refused: 'ended' })
    })

    it('takes out the members no process heard of within the grace, and ends the call they leave empty', async () => {
      const { call } = await callOf('ann')
      const bob = await callOf('bob')
      await sql`update calls.members set seen_at = now() - interval '31 seconds' where member = 'ann'`.execute(database.db)
      await store.heartbeat(joining('bob').process, [bob.row])
      await store.sweep()
      expect(await present(call)).toEqual(['bob'])
      await sql`update calls.members set seen_at = now() - interval '31 seconds'`.execute(database.db)
      await store.sweep()
      expect((await rosters(database.db, [call])).get(call)!.ended).toBe(true)
    })
  })

  describe('signals between processes', () => {
    it('are taken by the process they are for only, in the order they were written, once', async () => {
      const { call } = await callOf('ann')
      const here = '11111111-1111-1111-1111-111111111111'
      const there = '22222222-2222-2222-2222-222222222222'
      await store.writeSignal({ process: there, call, to: 'bob', from: 'ann', body: { n: 1 } })
      await store.writeSignal({ process: here, call, to: 'ann', from: 'bob', body: { n: 2 } })
      await store.writeSignal({ process: there, call, to: 'bob', from: 'ann', body: { n: 3 } })
      expect((await store.takeSignals(there, 10)).map((signal) => signal.body)).toEqual([{ n: 1 }, { n: 3 }])
      expect(await store.takeSignals(there, 10)).toEqual([])
      expect((await store.takeSignals(here, 10)).map((signal) => signal.body)).toEqual([{ n: 2 }])
    })
  })

  describe('a record\'s calls, as its readers get them', () => {
    let app: ReturnType<typeof createAdmin>
    beforeAll(() => {
      app = createAdmin({ resources: [meetings], db: database.db, authenticate: testAuthenticator, options: { roles }, calls: { backend: { kind: 'peer' } } })
    })
    const read = (path: string, user?: string) =>
      app.request(`/api/v1${path}`, { headers: user ? { authorization: `Bearer ${signTestToken({ sub: user, roles: ['member'] })}` } : {} })

    it('shows a reader of the record who is in its call and who was removed, and nothing of their network', async () => {
      const { call } = await callOf('ann')
      await callOf('bob')
      await store.remove(call, 'bob')
      const response = await read('/meetings/1:calls', 'alice')
      expect(response.status).toBe(200)
      const body = (await response.json()) as { items: { id: string; ended_at: null; members: { member: string }[]; removed: { member: string }[] }[] }
      expect(body.items).toEqual([expect.objectContaining({ id: call, started_by: 'ann', ended_at: null, members: [expect.objectContaining({ member: 'ann' })], removed: [expect.objectContaining({ member: 'bob' })] })])
      expect(JSON.stringify(body)).not.toMatch(/process|11111111|signal|candidate/)
    })

    it('tells a user who cannot read the record nothing of its calls', async () => {
      await callOf('ann')
      const response = await read('/meetings/1:calls', 'bob')
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain('ann')
      const stream = await read('/meetings/1:calls?watch=true', 'bob')
      expect(stream.status).toBe(404)
    })

    it('refuses a caller without a token', async () => {
      await callOf('ann')
      const response = await read('/meetings/1:calls')
      expect(response.status).toBe(401)
      expect(await response.text()).not.toContain('ann')
    })

    it('streams the calls to a reader at once', async () => {
      await callOf('ann')
      const response = await read('/meetings/1:calls?watch=true', 'alice')
      expect(response.headers.get('content-type')).toContain('text/event-stream')
      const reader = response.body!.getReader()
      const { value } = await reader.read()
      await reader.cancel()
      expect(new TextDecoder().decode(value)).toMatch(/^data: \{"items":\[\{"id":"[0-9a-f-]{36}","started_by":"ann"/)
    })
  })
})
