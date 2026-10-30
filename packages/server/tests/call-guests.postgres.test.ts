import { sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { rosters } from '../src/calls/call-reads'
import { sweepCalls } from '../src/calls/call-sweep'
import { sqlCallStore } from '../src/calls/calls-store'
import { callsMigration, callsSchemaSql, checkCalls } from '../src/calls/calls-sql'
import { guestStillAllowed } from '../src/calls/guest-checks-sql'
import { sqlGuestStore } from '../src/calls/guest-store'
import { guestMember, guestTokenPrefix, linkTokenPrefix, newToken, tokenHash } from '../src/calls/guest-tokens'
import { noticesTableSql } from '../src/live/notices-sql'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// Guests on Postgres, where links, the lobby, admissions, revocations, the organization's switch and the end of a call
// left to guests race for real: each change locks the call's row first.

const process = '11111111-1111-1111-1111-111111111111'
const standup = { resource: 'meetings', key: '1' }
const retro = { resource: 'meetings', key: '2' }
const organizations: Record<string, string | null> = { '1': 'acme', '2': 'acme', '3': null }

describe.skipIf(!(await postgresTemplateReady('empty')))('guests of calls, on Postgres', () => {
  let database: PostgresDatabase
  let calls: ReturnType<typeof sqlCallStore>
  let guests: ReturnType<typeof sqlGuestStore>

  beforeAll(async () => {
    database = await openPostgresDatabase('empty')
    await database.exec(`${callsSchemaSql}; create schema changes; ${noticesTableSql('changes')};`)
    calls = sqlCallStore(database.db, 10_000)
    guests = sqlGuestStore(database.db, 10_000, async (_trx, record) => organizations[record.key])
  })
  afterAll(async () => {
    await database?.close()
  })
  beforeEach(async () => {
    await database.exec('truncate calls.guests, calls.guest_links, calls.organization_guests, calls.signals, calls.rings, calls.members, calls.calls')
  })

  const join = async (member: string, record = standup, more: { maxMembers?: number } = {}) => {
    const admitted = await calls.admit({ record, member, process, maxMembers: more.maxMembers ?? 8, maxMinutes: 60 })
    if ('refused' in admitted) throw new Error(`${member} was refused: ${admitted.refused}`)
    return admitted
  }
  const linkOf = async (call: string, member = 'ann', more: { expiresAt?: Date } = {}) => {
    const made = await guests.createLink({ call, member, publish: ['microphone', 'camera'], ...more })
    if ('refused' in made) throw new Error(`No link: ${made.refused}`)
    return made
  }
  const enter = async (link: string, name = 'Eve') => {
    const token = newToken(guestTokenPrefix)
    const entered = await guests.enter({ link: tokenHash(linkTokenPrefix, link)!, name, token: tokenHash(guestTokenPrefix, token)! })
    return { entered, token, hash: tokenHash(guestTokenPrefix, token)! }
  }
  const waiting = async (link: string, name = 'Eve') => {
    const { entered, ...rest } = await enter(link, name)
    if ('refused' in entered) throw new Error('Not let into the lobby')
    return { guest: entered.guest, ...rest }
  }
  const admitted = async (call: string, link: string, name = 'Eve') => {
    const found = await waiting(link, name)
    expect(await guests.decide({ call, guest: found.guest, member: 'ann', admit: true, maxMembers: 8 })).toEqual({})
    return found
  }
  // The guest's join, as the guest call socket makes it once their token named them.
  const seat = async (token: Buffer, more: { maxMembers?: number; resume?: string } = {}) => {
    const row = (await guests.byToken(token))!
    return calls.admit({ record: row.record, member: guestMember(row.id), name: row.name, process, maxMembers: more.maxMembers ?? 8, maxMinutes: 60, guest: { id: row.id, call: row.call }, ...(more.resume && { resume: { call: more.resume, tracks: [] } }) })
  }
  const present = async (call: string) => (await rosters(database.db, [call])).get(call)!.members.map((member) => member.member).sort()

  describe('links', () => {
    it('are made only by a member in the call, for the organization of its own record, and kept as hashes', async () => {
      const { call } = await join('ann')
      const made = await linkOf(call)
      expect(made.link).toMatchObject({ created_by: 'ann', publish: ['microphone', 'camera'], expires_at: null })
      expect(await guests.createLink({ call, member: 'bob', publish: [] })).toEqual({ refused: 'gone' })
      const { rows } = await sql<{ organization_id: string; token_hash: Buffer }>`select "organization_id", "token_hash" from "calls"."guest_links"`.execute(database.db)
      expect(rows).toEqual([{ organization_id: 'acme', token_hash: tokenHash(linkTokenPrefix, made.token) }])
    })

    it('are refused on a call that ended, a record without an organization, and an organization that turned guests off', async () => {
      const ann = await join('ann')
      await calls.leave(ann.row, process)
      expect(await guests.createLink({ call: ann.call, member: 'ann', publish: [] })).toEqual({ refused: 'gone' })
      const loose = await join('ann', { resource: 'meetings', key: '3' })
      expect(await guests.createLink({ call: loose.call, member: 'ann', publish: [] })).toEqual({ refused: 'no-organization' })
      const { call } = await join('ann')
      await guests.setOrganization({ organization: 'acme', allowed: false, by: 'root' })
      expect(await guests.createLink({ call, member: 'ann', publish: [] })).toEqual({ refused: 'off' })
      expect(await guests.organizationAllowed('acme')).toBe(false)
      await guests.setOrganization({ organization: 'acme', allowed: true, by: 'root' })
      expect('link' in (await guests.createLink({ call, member: 'ann', publish: [] }))).toBe(true)
    })

    it('are revoked only by a member in their own call', async () => {
      const a = await join('ann')
      const b = await join('bob', retro)
      const made = await linkOf(a.call)
      expect(await guests.revokeLink({ call: b.call, link: made.link.id, member: 'bob' })).toBe(false)
      expect(await guests.revokeLink({ call: a.call, link: made.link.id, member: 'bob' })).toBe(false)
      expect(await guests.revokeLink({ call: a.call, link: made.link.id, member: 'ann' })).toBe(true)
      expect(await guests.revokeLink({ call: a.call, link: made.link.id, member: 'ann' })).toBe(false)
    })
  })

  describe('the lobby', () => {
    it('lets a guest wait on a live link, and tells them only their state, the call and what they may send', async () => {
      const { call } = await join('ann')
      const made = await linkOf(call)
      const eve = await waiting(made.token)
      expect(await guests.state(eve.hash)).toEqual({ state: 'waiting' })
      const lobby = (await guests.lobbies([call])).get(call)!
      expect(lobby.guests).toEqual([{ guest: eve.guest, name: 'Eve', since: expect.any(String) }])
      expect(lobby.links).toEqual([made.link])
      expect(await guests.decide({ call, guest: eve.guest, member: 'ann', admit: true, maxMembers: 8 })).toEqual({})
      expect(await guests.state(eve.hash)).toEqual({ state: 'admitted', call, publish: ['microphone', 'camera'] })
      expect((await guests.lobbies([call])).get(call)!.guests).toEqual([])
    })

    it('lets nobody wait on a link past its time, revoked, of a call that ended, or of an organization without guests', async () => {
      const { call, row } = await join('ann')
      const expiring = await linkOf(call)
      await sql`update "calls"."guest_links" set "expires_at" = now() - interval '1 second' where "id" = ${expiring.link.id}::uuid`.execute(database.db)
      expect((await enter(expiring.token)).entered).toEqual({ refused: 'gone' })
      const revoked = await linkOf(call)
      await guests.revokeLink({ call, link: revoked.link.id, member: 'ann' })
      expect((await enter(revoked.token)).entered).toEqual({ refused: 'gone' })
      const off = await linkOf(call)
      await guests.setOrganization({ organization: 'acme', allowed: false, by: 'root' })
      expect((await enter(off.token)).entered).toEqual({ refused: 'gone' })
      await guests.setOrganization({ organization: 'acme', allowed: true, by: 'root' })
      const ended = await linkOf(call)
      await calls.leave(row, process)
      expect((await enter(ended.token)).entered).toEqual({ refused: 'gone' })
      expect((await enter(newToken(linkTokenPrefix))).entered).toEqual({ refused: 'gone' })
    })

    it('holds ten waiting on a link at most, and lets nobody else wait once three were turned away', async () => {
      const { call } = await join('ann')
      const crowded = await linkOf(call)
      for (let i = 0; i < 10; i++) await waiting(crowded.token)
      expect((await enter(crowded.token)).entered).toEqual({ refused: 'gone' })
      const forwarded = await linkOf(call)
      for (let i = 0; i < 3; i++) {
        const stranger = await waiting(forwarded.token)
        expect(await guests.decide({ call, guest: stranger.guest, member: 'ann', admit: false, maxMembers: 8 })).toEqual({})
        expect(await guests.state(stranger.hash)).toEqual({ state: 'denied' })
      }
      expect((await enter(forwarded.token)).entered).toEqual({ refused: 'gone' })
    })

    it('forgets a guest whose page stopped asking, and one who left', async () => {
      const { call } = await join('ann')
      const made = await linkOf(call)
      const gone = await waiting(made.token, 'Gone')
      const left = await waiting(made.token, 'Left')
      await sql`update "calls"."guests" set "seen_at" = now() - interval '11 seconds' where "id" = ${gone.guest}::uuid`.execute(database.db)
      await guests.leave(left.hash)
      expect((await guests.lobbies([call])).get(call)!.guests).toEqual([])
      expect(await guests.state(left.hash)).toBeUndefined()
    })
  })

  describe('decisions', () => {
    it('are made only by a member in the call, on a guest waiting for that call', async () => {
      const a = await join('ann')
      const b = await join('bob', retro)
      const eve = await waiting((await linkOf(a.call)).token)
      expect(await guests.decide({ call: b.call, guest: eve.guest, member: 'bob', admit: true, maxMembers: 8 })).toEqual({ refused: 'gone' })
      expect(await guests.decide({ call: a.call, guest: eve.guest, member: 'bob', admit: true, maxMembers: 8 })).toEqual({ refused: 'gone' })
      expect(await guests.decide({ call: a.call, guest: eve.guest, member: guestMember(eve.guest), admit: true, maxMembers: 8 })).toEqual({ refused: 'gone' })
      expect(await guests.state(eve.hash)).toEqual({ state: 'waiting' })
    })

    it('let only the guest admitted in, as themselves; a guest still waiting, or turned away, never', async () => {
      const { call } = await join('ann')
      const made = await linkOf(call)
      const eve = await waiting(made.token, 'Eve')
      const mal = await waiting(made.token, 'Mal')
      await guests.decide({ call, guest: eve.guest, member: 'ann', admit: true, maxMembers: 8 })
      expect(await seat(mal.hash)).toEqual({ refused: 'ended' })
      await guests.decide({ call, guest: mal.guest, member: 'ann', admit: false, maxMembers: 8 })
      expect(await seat(mal.hash)).toEqual({ refused: 'ended' })
      expect('row' in (await seat(eve.hash))).toBe(true)
      expect(await present(call)).toEqual(['ann', guestMember(eve.guest)])
      const roster = (await rosters(database.db, [call])).get(call)!.members
      expect(roster.find((member) => member.member === guestMember(eve.guest))!.name).toBe('Eve')
    })

    it('say a full call is full, and two admissions racing for its last place seat one guest', async () => {
      const { call } = await join('ann', standup, { maxMembers: 2 })
      const made = await linkOf(call)
      const eve = await waiting(made.token, 'Eve')
      const mal = await waiting(made.token, 'Mal')
      const decided = await Promise.all([eve, mal].map((guest) => guests.decide({ call, guest: guest.guest, member: 'ann', admit: true, maxMembers: 2 })))
      expect(decided).toEqual([{}, {}])
      const seated = await Promise.all([eve, mal].map((guest) => seat(guest.hash, { maxMembers: 2 })))
      expect(seated.filter((one) => 'row' in one)).toHaveLength(1)
      expect(seated.filter((one) => 'refused' in one)).toEqual([{ refused: 'full' }])
      expect(await present(call)).toHaveLength(2)
      const late = await waiting(made.token, 'Late')
      expect(await guests.decide({ call, guest: late.guest, member: 'ann', admit: true, maxMembers: 2 })).toEqual({ refused: 'full' })
    })
  })

  describe("an admitted guest's join", () => {
    it("goes only into their link's call: a resume of another call is refused, and no join reaches it", async () => {
      const a = await join('ann')
      const b = await join('bob', retro)
      const eve = await admitted(a.call, (await linkOf(a.call)).token)
      expect(await seat(eve.hash, { resume: b.call })).toEqual({ refused: 'ended' })
      expect(await present(b.call)).toEqual(['bob'])
      const row = (await guests.byToken(eve.hash))!
      // Even naming the other record, a guest's join locks and enters only their own call.
      expect(await calls.admit({ record: retro, member: guestMember(row.id), process, maxMembers: 8, maxMinutes: 60, guest: { id: row.id, call: row.call } })).toEqual({ refused: 'ended' })
      expect(await present(b.call)).toEqual(['bob'])
    })

    it('takes one place however many sockets the same token opens', async () => {
      const { call } = await join('ann', standup, { maxMembers: 2 })
      const eve = await admitted(call, (await linkOf(call)).token)
      const [first, second] = await Promise.all([seat(eve.hash, { maxMembers: 2 }), seat(eve.hash, { maxMembers: 2 })])
      expect([first, second].every((one) => 'row' in one)).toBe(true)
      expect(await present(call)).toEqual(['ann', guestMember(eve.guest)])
    })

    it('is checked again every minute: removed, revoked, turned off, expired or the call over, the guest is out', async () => {
      const { call } = await join('ann')
      const allowedNow = async (guest: string) => guestStillAllowed(database.db, guest)
      const removed = await admitted(call, (await linkOf(call)).token)
      await seat(removed.hash)
      expect(await allowedNow(removed.guest)).toBe(true)
      await calls.remove(call, guestMember(removed.guest))
      expect(await allowedNow(removed.guest)).toBe(false)
      expect(await seat(removed.hash)).toEqual({ refused: 'ended' })

      const revokedLink = await linkOf(call)
      const revoked = await admitted(call, revokedLink.token)
      await seat(revoked.hash)
      await guests.revokeLink({ call, link: revokedLink.link.id, member: 'ann' })
      expect(await allowedNow(revoked.guest)).toBe(false)
      expect(await present(call)).toEqual(['ann'])

      const expiringLink = await linkOf(call)
      const expiring = await admitted(call, expiringLink.token)
      await sql`update "calls"."guest_links" set "expires_at" = now() - interval '1 second' where "id" = ${expiringLink.link.id}::uuid`.execute(database.db)
      expect(await allowedNow(expiring.guest)).toBe(false)

      const off = await admitted(call, (await linkOf(call)).token)
      await seat(off.hash)
      await guests.setOrganization({ organization: 'acme', allowed: false, by: 'root' })
      expect(await allowedNow(off.guest)).toBe(false)
      expect(await present(call)).toEqual(['ann'])
    })

    it('loses to a revocation racing it: the guest ends up out of the call', async () => {
      for (let round = 0; round < 5; round++) {
        const { call } = await join('ann')
        const made = await linkOf(call)
        const eve = await admitted(call, made.token)
        await Promise.all([seat(eve.hash), guests.revokeLink({ call, link: made.link.id, member: 'ann' })])
        expect(await present(call)).toEqual(['ann'])
        expect(await seat(eve.hash)).toEqual({ refused: 'ended' })
      }
    })
  })

  describe('the end of a call left to guests', () => {
    it('comes two minutes after the last of the app\'s members left, and the guest can no longer resume', async () => {
      const ann = await join('ann')
      const eve = await admitted(ann.call, (await linkOf(ann.call)).token)
      await seat(eve.hash)
      await calls.leave(ann.row, process)
      await sweepCalls(database.db, 10_000)
      expect(await present(ann.call)).toEqual([guestMember(eve.guest)])
      await sql`update "calls"."members" set "left_at" = now() - interval '121 seconds' where "member" = 'ann'`.execute(database.db)
      expect(await sweepCalls(database.db, 10_000)).toEqual([standup])
      expect((await rosters(database.db, [ann.call])).get(ann.call)!.ended).toBe(true)
      expect(await seat(eve.hash, { resume: ann.call })).toEqual({ refused: 'ended' })
      expect(await guests.state(eve.hash)).toEqual({ state: 'ended' })
    })

    it('does not come when a member is back before then', async () => {
      const ann = await join('ann')
      const eve = await admitted(ann.call, (await linkOf(ann.call)).token)
      await seat(eve.hash)
      await calls.leave(ann.row, process)
      await join('ann')
      await sql`update "calls"."members" set "left_at" = now() - interval '121 seconds' where "member" = 'ann' and "left_at" is not null`.execute(database.db)
      expect(await sweepCalls(database.db, 10_000)).toEqual([])
      expect(await present(ann.call)).toEqual(['ann', guestMember(eve.guest)])
    })
  })

  it('adds the guest tables to a calls schema without them, through the migration', async () => {
    await database.exec('drop table calls.guests, calls.guest_links, calls.organization_guests; alter table calls.members drop column name')
    await expect(checkCalls(database.db, {}, undefined)).rejects.toThrow('The calls schema or the notices table that rings go through is missing')
    const migration = await callsMigration(database.db)
    expect(migration).toContain('create table if not exists "calls"."guest_links"')
    expect(migration).not.toContain('create table if not exists "calls"."calls"')
    await database.exec(migration!)
    await checkCalls(database.db, {}, undefined)
    expect(await callsMigration(database.db)).toBeUndefined()
  })
})
