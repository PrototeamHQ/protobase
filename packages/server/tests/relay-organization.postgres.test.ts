import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { channelMembers, memberships } from '../src/relay/members-sql'
import { mergedAudience, organizationAudience, organizationCoMembers, organizationMemberships } from '../src/relay/organization-audience'
import { memberTableSql, organizationMembersJob } from '../src/relay/organization-members-sql'
import { organizationMoves, type MemberPair } from '../src/relay/organization-moves'
import type { OrganizationMembers } from '../src/relay/organization-members'
import { listedTable, listedTableSql, membersFunctionsSql, membersTableSql } from '../src/relay/realtime-members-sql'
import { relayModels } from '../src/relay/relay-models'
import { relayModule } from '../src/relay/relay-module'
import { resourceEntry } from '../src/schema-modules/resource-difference'
import { workspaceChannelsModel } from '../src/relay/testing/chat-models'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// A workspace chat's channels on real Postgres: a public channel, whose `member_ids` is null, reaches every member of
// its organization through the auth store's member table; a private one only the people it lists, through
// `realtime.members`; and a change of who is in an organization queues the job that moves them in or out of its public
// channels, from the member table's triggers.
const ready = await postgresTemplateReady('jobs')

const models = relayModels({ channels: { channels: { members: { field: 'member_ids', organization: 'when-null' } } } }, [workspaceChannelsModel()])
const store: OrganizationMembers = { table: 'auth.member', organization: 'organization_id', user: 'user_id' }

const tables = `
create schema auth;
create table auth.member (id text primary key, organization_id text not null, user_id text not null, role text not null);
create index on auth.member (organization_id);
create index on auth.member (user_id);
insert into auth.member values ('m1', 'a', 'ann', 'owner'), ('m2', 'a', 'bob', 'member'), ('m3', 'b', 'carl', 'owner');
create table channels (id integer primary key, organization_id text not null, member_ids jsonb, deleted_at timestamptz);
create index channels_public on channels (organization_id) where member_ids is null and deleted_at is null;
insert into channels values (1, 'a', null, null), (2, 'a', '["ann"]', null), (3, 'a', '[]', null), (4, 'b', null, null), (5, 'a', null, '2026-11-01');
`

const statements = (list: readonly string[]) => `${list.join(';\n')};`

let pg: PostgresDatabase
beforeAll(async () => {
  if (!ready) return
  pg = await openPostgresDatabase('jobs')
  await pg.exec(tables)
  await pg.exec(statements([...membersTableSql, ...membersFunctionsSql, ...listedTableSql(listedTable(models.channels.get('channels')!.listed!)), ...memberTableSql({ table: '"auth"."member"', organization: 'organization_id', user: 'user_id' })]))
})
afterAll(async () => {
  await pg?.close()
})

// The pairs the member table's triggers queued since the last read, each job taken off the queue as it is read.
const queued = async (): Promise<MemberPair[]> => {
  const { rows } = await sql<{ data: { members: MemberPair[] } }>`delete from jobs.job where name = ${organizationMembersJob} returning data`.execute(pg.db)
  return rows.flatMap((row) => row.data.members)
}

const audience = async (channels: string[]) => {
  const wide = await organizationAudience(pg.db, models, store, [], channels)
  const members = mergedAudience(await channelMembers(pg.db, models, channels), wide.channels)
  return Object.fromEntries([...members].map(([channel, people]) => [channel, [...people].sort()]))
}

describe.skipIf(!ready)('channels that reach their whole organization', () => {
  it('list a public channel in the tickets of its organization alone, beside the private ones a person is listed in', async () => {
    const ticket = async (user: string) => [...(await memberships(pg.db, models, user)), ...(await organizationMemberships(pg.db, models, store, user))].sort()
    expect(await ticket('ann')).toEqual(['channels/1', 'channels/2'])
    expect(await ticket('bob')).toEqual(['channels/1'])
    expect(await ticket('carl')).toEqual(['channels/4'])
    expect(await ticket('nobody')).toEqual([])
  })

  it("notice a public channel to each member of its organization and nobody of another, a private one to whom it lists, and an empty list to nobody", async () => {
    expect(await audience(['channels/1', 'channels/2', 'channels/3', 'channels/4', 'channels/5'])).toEqual({ 'channels/1': ['ann', 'bob'], 'channels/2': ['ann'], 'channels/4': ['carl'] })
  })

  it("read the members of the organizations a batch's records reach before or after their change", async () => {
    const closed = { resource: 'channels', key: '1', operation: 'update', before: { id: 1, organization_id: 'a', member_ids: null }, after: { id: 1, organization_id: 'a', member_ids: ['ann'] } } as never
    const wide = await organizationAudience(pg.db, models, store, [closed], [])
    expect(Object.fromEntries([...wide.organizations].map(([organization, people]) => [organization, people.sort()]))).toEqual({ a: ['ann', 'bob'] })
  })

  it('share a public channel for presence with everyone in its organization', async () => {
    const shared = await organizationCoMembers(pg.db, models, store, ['bob', 'carl'])
    expect(shared.get('bob')?.sort()).toEqual(['ann', 'bob'])
    expect(shared.get('carl')).toEqual(['carl'])
  })

  it("move someone who joins an organization into its public channels, and someone who leaves it out, a new role moving nobody", async () => {
    await queued()
    await sql`insert into auth.member values ('m4', 'a', 'dora', 'member')`.execute(pg.db)
    const joined = await queued()
    expect(joined).toEqual([{ organization: 'a', user: 'dora' }])
    expect(await organizationMoves(pg.db, models, store, joined, 'job-1')).toEqual([
      { kind: 'add', channel: 'channels/1', users: ['dora'] },
      { kind: 'publish', id: 'job-1:channels/1:joined', channel: 'people', users: ['dora'], event: 'joined', payload: { channel: 'channels/1' } },
    ])
    await sql`update auth.member set role = 'admin' where id = 'm4'`.execute(pg.db)
    expect(await queued()).toEqual([])
    await sql`delete from auth.member where id = 'm2'`.execute(pg.db)
    const left = await queued()
    expect(left).toEqual([{ organization: 'a', user: 'bob' }])
    expect(await organizationMoves(pg.db, models, store, left, 'job-2')).toEqual([{ kind: 'remove', channel: 'channels/1', users: ['bob'] }])
    expect(await audience(['channels/1'])).toEqual({ 'channels/1': ['ann', 'dora'] })
  })

  it("move someone a statement moves to another organization out of the old one's public channels and into the new one's", async () => {
    await sql`update auth.member set organization_id = 'b' where id = 'm4'`.execute(pg.db)
    const moved = await queued()
    expect(moved.map((pair) => `${pair.organization}:${pair.user}`).sort()).toEqual(['a:dora', 'b:dora'])
    const commands = await organizationMoves(pg.db, models, store, moved, 'job-3')
    expect(commands.filter((command) => command.kind !== 'publish')).toEqual([
      { kind: 'add', channel: 'channels/4', users: ['dora'] },
      { kind: 'remove', channel: 'channels/1', users: ['dora'] },
    ])
  })

  it("reads the member table's triggers as current for the migration, and as ones to drop once no channel needs them", async () => {
    const member = { table: { schema: 'auth', name: 'member' }, input: { table: '"auth"."member"', organization: 'organization_id', user: 'user_id' } }
    const input = (organization: object) => ({ names: { sessions: '"session"' }, resources: { members: {}, ...organization } })
    const organization = relayModule.resourceReplaceables.find((replaceable) => replaceable.name === 'organization')!
    expect((await relayModule.read(pg.db, input({ organization: { member } })))?.resources?.organization).toEqual({ member: resourceEntry(organization, { sessions: '"session"' }, member) })
    expect((await relayModule.read(pg.db, input({})))?.resources?.organization).toEqual({ member: { version: organization.version, digest: '', table: { schema: 'auth', name: 'member' } } })
  })

  it("read an organization's public channels through the tenant column's index", async () => {
    const plan = await pg.db.transaction().execute(async (trx) => {
      await sql`set local enable_seqscan = off`.execute(trx)
      return JSON.stringify((await sql`explain (costs off) select id from channels where organization_id = any(${['a']}) and member_ids is null and deleted_at is null`.execute(trx)).rows)
    })
    expect(plan).toContain('channels_public')
  })
})
