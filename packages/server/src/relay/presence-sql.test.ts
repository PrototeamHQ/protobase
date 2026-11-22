import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { presenceRestart, presenceUpsert } from './presence-sql'
import { relayModels } from './relay-models'
import { chatModels, chatPresence, chatRelay } from './testing/chat-models'

const db = new Kysely<unknown>({ dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(), createIntrospector: (kysely) => new PostgresIntrospector(kysely), createQueryCompiler: () => new PostgresQueryCompiler() } })
const presence = relayModels({ ...chatRelay, presence: chatPresence }, chatModels()).presence!
const flat = (text: string) => text.replace(/\s+/g, ' ')

describe('presenceUpsert', () => {
  it("upserts each person's latest change, replacing only an older status", () => {
    const query = presenceUpsert(presence, [{ user: 'u1', status: 'away', at: 1795200000000 }]).compile(db)
    expect(flat(query.sql)).toBe(
      'insert into "presences" as kept ("user_id", "status", "since") select distinct on (change."user_id") change."user_id", change."status", change."since" ' +
        'from jsonb_populate_recordset(null::"presences", $1::jsonb) as change order by change."user_id", change."since" desc ' +
        'on conflict ("user_id") do update set "status" = excluded."status", "since" = excluded."since" where excluded."since" > kept."since"',
    )
    expect(JSON.parse(query.parameters[0] as string)).toEqual([{ user_id: 'u1', status: 'away', since: '2026-11-20T18:40:00.000Z' }])
  })
})

describe('presenceRestart', () => {
  it('sets everyone not reported since the start and not offline to offline, as of the start', () => {
    const query = presenceRestart(presence, 1795190000000).compile(db)
    expect(flat(query.sql)).toBe('update "presences" set "status" = \'offline\', "since" = $1 where "since" < $2 and "status" <> \'offline\'')
    expect(query.parameters).toEqual(['2026-11-20T15:53:20.000Z', '2026-11-20T15:53:20.000Z'])
  })
})
