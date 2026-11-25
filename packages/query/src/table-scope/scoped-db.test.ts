import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, sql, type Compilable, type RawBuilder } from 'kysely'
import { describe, expect, it } from 'vitest'
import { scoped, unscoped } from './raw-tables'
import { everyOrganization, type EveryOrganization } from './organization-source'
import { ScopeRefused, type Organization } from './scope-condition'
import { scopedDb } from './scoped-db'
import type { ScopedTables } from './scoped-tables'

const base = new Kysely<any>({
  dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(), createIntrospector: (db) => new PostgresIntrospector(db), createQueryCompiler: () => new PostgresQueryCompiler() },
})
const scope: ScopedTables = { tables: [{ schema: 'auth', table: 'member', column: 'organization_id' }, { schema: 'auth', table: 'invitation', column: 'organization_id' }] }
const db = scopedDb(base, scope, 'org-a')
const none = scopedDb(base, scope, undefined)

// The query as the database it runs on sends it: a builder of `db` by default, raw SQL on `db`.
const compiledText = (query: Compilable) => compiled(query).text
const compiled = (query: Compilable | RawBuilder<unknown>, on: Kysely<any> = db) => {
  const { sql: text, parameters } = 'isRawBuilder' in query ? query.compile(on) : query.compile()
  return { text, parameters }
}

describe('scopedDb', () => {
  it('filters a read of a scoped table in its where, by alias where it has one', () => {
    expect(compiled(db.selectFrom('auth.member').select('id').where('user_id', '=', 'u1'))).toEqual({
      text: 'select "id" from "auth"."member" where ("user_id" = $1) and "auth"."member"."organization_id" = $2',
      parameters: ['u1', 'org-a'],
    })
    expect(compiled(db.selectFrom('auth.member as m').select('m.id')).text).toBe('select "m"."id" from "auth"."member" as "m" where "m"."organization_id" = $1')
  })

  it('keeps an or of the query apart from the scope', () => {
    const query = db.selectFrom('auth.member').select('id').where((eb) => eb.or([eb('role', '=', 'owner'), eb('role', '=', 'admin')]))
    expect(compiled(query).text).toBe('select "id" from "auth"."member" where (("role" = $1 or "role" = $2)) and "auth"."member"."organization_id" = $3')
  })

  it('filters a left joined scoped table in the join, so its other side keeps every row', () => {
    const query = db.selectFrom('auth.user as u').leftJoin('auth.member as m', 'm.user_id', 'u.id').select(['u.id', 'm.role'])
    expect(compiled(query).text).toBe('select "u"."id", "m"."role" from "auth"."user" as "u" left join "auth"."member" as "m" on ("m"."user_id" = "u"."id") and "m"."organization_id" = $1')
  })

  it('filters each subquery, exists and common table expression at the select that reads the table', () => {
    const subquery = db.selectFrom('auth.user').select('id').where('id', 'in', db.selectFrom('auth.member').select('user_id'))
    expect(compiled(subquery).text).toBe('select "id" from "auth"."user" where "id" in (select "user_id" from "auth"."member" where "auth"."member"."organization_id" = $1)')
    const exists = db.selectFrom('auth.user as u').select('u.id').where((eb) => eb.exists(eb.selectFrom('auth.invitation as i').select('i.id').whereRef('i.email', '=', 'u.email')))
    expect(compiled(exists).text).toBe('select "u"."id" from "auth"."user" as "u" where exists (select "i"."id" from "auth"."invitation" as "i" where ("i"."email" = "u"."email") and "i"."organization_id" = $1)')
    const cte = db.with('owners', (q) => q.selectFrom('auth.member').select('user_id').where('role', '=', 'owner')).selectFrom('owners').select('user_id')
    expect(compiled(cte).text).toBe('with "owners" as (select "user_id" from "auth"."member" where ("role" = $1) and "auth"."member"."organization_id" = $2) select "user_id" from "owners"')
  })

  it('takes an unqualified name for a store in public, the default search path, as the store table', () => {
    const publicStore = scopedDb(base, { tables: [{ schema: 'public', table: 'member', column: 'organization_id' }] }, 'org-a')
    expect(compiledText(publicStore.selectFrom('member').select('id'))).toBe('select "id" from "member" where "member"."organization_id" = $1')
    expect(compiledText(publicStore.selectFrom('auth.member').select('id'))).toBe('select "id" from "auth"."member"')
  })

  it('takes an unqualified name for the scoped table only where the search path finds it', () => {
    expect(compiled(db.selectFrom('member').selectAll()).text).toBe('select * from "member"')
    const searched = scopedDb(base, { ...scope, searchSchema: 'auth' }, 'org-a')
    expect(compiledText(searched.selectFrom('member').selectAll())).toBe('select * from "member" where "member"."organization_id" = $1')
    const loose = scopedDb(base, { tables: [{ table: 'member', column: 'organization_id' }], searchSchema: 'public' }, 'org-a')
    expect(compiledText(loose.selectFrom('public.member').selectAll())).toBe('select * from "public"."member" where "public"."member"."organization_id" = $1')
    expect(compiledText(loose.selectFrom('other.member').selectAll())).toBe('select * from "other"."member"')
  })

  it('leaves a common table expression that takes the table name alone, but not the table its body reads', () => {
    const local = scopedDb(base, { tables: [{ table: 'member', column: 'organization_id' }] }, 'org-a')
    const query = local.with('member', (q) => q.selectFrom('member').select('id')).selectFrom('member').select('id')
    expect(compiledText(query)).toBe('with "member" as (select "id" from "member" where "member"."organization_id" = $1) select "id" from "member"')
  })

  it('filters the target and the from of an update, and the target and using of a delete', () => {
    const update = db.updateTable('auth.member as m').set({ role: 'admin' }).from('auth.invitation as i').whereRef('i.email', '=', 'm.user_id')
    expect(compiled(update).text).toBe('update "auth"."member" as "m" set "role" = $1 from "auth"."invitation" as "i" where (("i"."email" = "m"."user_id") and "m"."organization_id" = $2) and "i"."organization_id" = $3')
    const remove = db.deleteFrom('auth.member').using('auth.invitation').whereRef('auth.invitation.email', '=', 'auth.member.user_id')
    expect(compiled(remove).text).toBe('delete from "auth"."member" using "auth"."invitation" where (("auth"."invitation"."email" = "auth"."member"."user_id") and "auth"."member"."organization_id" = $1) and "auth"."invitation"."organization_id" = $2')
  })

  it('refuses an update that moves a row to another organization', () => {
    expect(() => compiled(db.updateTable('auth.member').set({ organization_id: 'org-b' }))).toThrow(ScopeRefused)
    expect(() => compiled(db.updateTable('auth.member').set('organization_id', 'org-b'))).toThrow(ScopeRefused)
    expect(compiled(db.updateTable('auth.member').set({ organization_id: 'org-a' })).text).toBe('update "auth"."member" set "organization_id" = $1 where "auth"."member"."organization_id" = $2')
  })

  it('writes the organization on an insert and refuses another one', () => {
    expect(compiled(db.insertInto('auth.member').values({ id: 'm1', user_id: 'u1' }))).toEqual({
      text: 'insert into "auth"."member" ("id", "user_id", "organization_id") values ($1, $2, $3)',
      parameters: ['m1', 'u1', 'org-a'],
    })
    expect(compiled(db.insertInto('auth.member').values({ id: 'm1', organization_id: 'org-a' })).parameters).toEqual(['m1', 'org-a'])
    expect(() => compiled(db.insertInto('auth.member').values([{ id: 'm1', organization_id: 'org-a' }, { id: 'm2', organization_id: 'org-b' }]))).toThrow(ScopeRefused)
    expect(() => compiled(db.insertInto('auth.member').values({ id: 'm1', organization_id: sql`'org-b'` }))).toThrow(ScopeRefused)
  })

  it('writes the organization in a row of a batch that leaves it out where another names it', () => {
    expect(compiled(db.insertInto('auth.member').values([{ id: 'm1', organization_id: 'org-a' }, { id: 'm2' }]))).toEqual({
      text: 'insert into "auth"."member" ("id", "organization_id") values ($1, $2), ($3, $4)',
      parameters: ['m1', 'org-a', 'm2', 'org-a'],
    })
  })

  it('takes a write target for the table even where a common table expression has its name', () => {
    const local = scopedDb(base, { tables: [{ table: 'member', column: 'organization_id' }] }, 'org-a')
    const update = local.with('member', (q) => q.selectFrom('auth.user').select('id')).updateTable('member').set({ role: 'admin' })
    expect(compiledText(update)).toBe('with "member" as (select "id" from "auth"."user") update "member" set "role" = $1 where "member"."organization_id" = $2')
    const remove = local.with('member', (q) => q.selectFrom('auth.user').select('id')).deleteFrom('member')
    expect(compiledText(remove)).toBe('with "member" as (select "id" from "auth"."user") delete from "member" where "member"."organization_id" = $1')
  })

  it('refuses a merge into a scoped table, and keeps a merge with common table expressions balanced', () => {
    expect(() => compiled(db.mergeInto('auth.member').using('auth.user', 'auth.user.id', 'auth.member.user_id').whenMatched().thenDelete())).toThrow('Not implemented')
    const merge = db.with('x', (q) => q.selectFrom('auth.user').select('id')).mergeInto('public.t').using('x', 'x.id', 'public.t.id').whenMatched().thenDelete()
    expect(compiledText(merge)).toBe('with "x" as (select "id" from "auth"."user") merge into "public"."t" using "x" on "x"."id" = "public"."t"."id" when matched then delete')
    expect(compiledText(db.selectFrom('auth.member').select('id'))).toBe('select "id" from "auth"."member" where "auth"."member"."organization_id" = $1')
  })

  it('refuses an insert … select whose organization column it cannot place', () => {
    const union = db.insertInto('auth.invitation').columns(['id', 'email']).expression(db.selectFrom('auth.user').select(['id', 'email']).union(db.selectFrom('auth.user').select(['id', 'email'])))
    expect(() => compiled(union)).toThrow('Not implemented')
  })

  it('scopes the select of an insert … select and writes the organization in it', () => {
    const query = db.insertInto('auth.invitation').columns(['id', 'email']).expression((eb) => eb.selectFrom('auth.member').select(['id', 'user_id']))
    expect(compiled(query).text).toBe('insert into "auth"."invitation" ("id", "email", "organization_id") select "id", "user_id", $1 as "organization_id" from "auth"."member" where "auth"."member"."organization_id" = $2')
    const naming = db.insertInto('auth.invitation').columns(['id', 'organization_id']).expression((eb) => eb.selectFrom('auth.member').select(['id', 'organization_id']))
    expect(() => compiled(naming)).toThrow(ScopeRefused)
  })

  it("updates on conflict only the organization's own row", () => {
    const query = db.insertInto('auth.member').values({ id: 'm1', role: 'member' }).onConflict((oc) => oc.column('id').doUpdateSet({ role: 'admin' }))
    expect(compiled(query).text).toBe('insert into "auth"."member" ("id", "role", "organization_id") values ($1, $2, $3) on conflict ("id") do update set "role" = $4 where "member"."organization_id" = $5')
  })

  it('sees no row and writes none without an organization', () => {
    expect(compiledText(none.selectFrom('auth.member').select('id'))).toBe('select "id" from "auth"."member" where false')
    expect(() => compiledText(none.insertInto('auth.member').values({ id: 'm1' }))).toThrow(ScopeRefused)
  })

  it('reads the organization of a source as each query is built', () => {
    let current: Organization | EveryOrganization = 'org-a'
    const sourced = scopedDb(base, scope, () => current)
    const query = sourced.selectFrom('auth.member').select('id')
    expect(compiled(query).parameters).toEqual(['org-a'])
    current = 'org-b'
    expect(compiled(query).parameters).toEqual(['org-b'])
    expect(sourced.organization).toBe('org-b')
    current = undefined
    expect(compiledText(query)).toBe('select "id" from "auth"."member" where false')
    current = everyOrganization('a user lists their own memberships')
    expect(compiledText(query)).toBe('select "id" from "auth"."member"')
    expect(compiledText(sourced.insertInto('auth.member').values({ id: 'm1', organization_id: 'org-b' }))).toBe('insert into "auth"."member" ("id", "organization_id") values ($1, $2)')
    expect(() => everyOrganization(' ')).toThrow('reason')
  })

  it('fails fast on joins it cannot scope', () => {
    expect(() => compiled(db.selectFrom('auth.member').rightJoin('auth.user', 'auth.user.id', 'auth.member.user_id').selectAll())).toThrow('Not implemented')
    expect(() => compiled(db.selectFrom('auth.user').fullJoin('auth.member', 'auth.user.id', 'auth.member.user_id').selectAll())).toThrow('Not implemented')
  })

  it('refuses raw SQL naming a scoped table outside scoped() and unscoped()', () => {
    expect(() => compiled(sql`select * from ${sql.table('auth.member')}`)).toThrow(ScopeRefused)
    expect(() => compiled(sql`select * from ${sql.id('auth', 'member')}`)).toThrow(ScopeRefused)
    expect(compiled(sql`select id from ${scoped('auth.member')} as m`)).toEqual({ text: 'select id from (select * from "auth"."member" where "auth"."member"."organization_id" = $1) as m', parameters: ['org-a'] })
    expect(compiled(sql`select id from ${unscoped('counts members across organizations', 'auth.member')}`).text).toBe('select id from /* every organization: unscoped() */ "auth"."member"')
    expect(() => compiled(sql`select id from /* unscoped */ ${sql.table('auth.member')}`)).toThrow(ScopeRefused)
    expect(() => unscoped(' ', 'auth.member')).toThrow('reason')
    const local = scopedDb(base, { tables: [{ table: 'member', column: 'organization_id' }] }, 'org-a')
    expect(compiledText(local.with('member', (q) => q.selectFrom('auth.user').select('id')).selectFrom(sql`${sql.id('member')}`.as('m')).selectAll())).toBe('with "member" as (select "id" from "auth"."user") select * from "member" as "m"')
    expect(() => compiledText(local.selectFrom(sql`${sql.id('member')}`.as('m')).selectAll())).toThrow(ScopeRefused)
  })

  it('scopes queries a raw template embeds', () => {
    expect(compiled(sql`select count(*) from ${db.selectFrom('auth.member').select('id')} as m`).text).toBe('select count(*) from (select "id" from "auth"."member" where "auth"."member"."organization_id" = $1) as m')
  })

  it('opts out by name only', () => {
    expect(compiled(db.unscoped('lists every membership for the host').selectFrom('auth.member').select('id')).text).toBe('select "id" from "auth"."member"')
    expect(() => db.unscoped('')).toThrow('reason')
    expect(() => db.withoutPlugins()).toThrow("db.unscoped('<reason>')")
    expect(() => db.withSchema('auth').withoutPlugins()).toThrow("db.unscoped('<reason>')")
    expect(db.withSchema('auth').organization).toBe('org-a')
  })

  it('keeps the schema and the other plugins when it opts out', () => {
    expect(compiled(db.withSchema('auth').unscoped('lists every membership for the host').selectFrom('member').select('id')).text).toBe('select "id" from "auth"."member"')
  })

  it('keeps the scope and its refusal in transactions, connections and with()', async () => {
    const seen: string[] = []
    await db.transaction().execute(async (trx) => {
      expect(() => trx.withoutPlugins()).toThrow("db.unscoped('<reason>')")
      seen.push(trx.selectFrom('auth.member').select('id').compile().sql)
    })
    await db.connection().execute(async (connection) => {
      expect(() => connection.withoutPlugins()).toThrow("db.unscoped('<reason>')")
    })
    expect(() => db.with('x', (q) => q.selectFrom('auth.user').select('id')).withoutPlugins()).toThrow("db.unscoped('<reason>')")
    expect(seen).toEqual(['select "id" from "auth"."member" where "auth"."member"."organization_id" = $1'])
  })

  it('scopes names withSchema qualifies', () => {
    expect(compiledText(db.withSchema('auth').selectFrom('member').select('id'))).toBe('select "id" from "auth"."member" where "auth"."member"."organization_id" = $1')
  })
})
