import { sql, type Kysely, type RawBuilder } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scoped } from '../src/table-scope/raw-tables'
import { ScopeRefused, type Organization } from '../src/table-scope/scope-condition'
import { scopedDb, type ScopedDb } from '../src/table-scope/scoped-db'
import type { ScopedTables } from '../src/table-scope/scoped-tables'
import { createTestDb } from '../../../test-support/query'

// The scope against row-level security on real Postgres: each query shape, run through the scope, returns the rows the
// plain query returns as a role whose policies show one organization only.

const scope: ScopedTables = { tables: [{ schema: 'auth', table: 'member', column: 'organization_id' }, { schema: 'auth', table: 'invitation', column: 'organization_id' }] }

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => {
  ctx = await createTestDb({ seed: false })
  await ctx.pg.exec(`
    create schema auth;
    create table auth."user" (id text primary key, email text not null);
    create table auth.member (id text primary key, organization_id text not null, user_id text not null references auth."user", role text not null);
    create table auth.invitation (id text primary key, organization_id text not null, email text not null);
    create table public.member (id text primary key, organization_id text not null);
    insert into auth."user" values ('ann', 'ann@a.test'), ('bob', 'bob@b.test'), ('cy', 'cy@ab.test'), ('dee', 'dee@none.test');
    insert into auth.member values ('m1', 'org-a', 'ann', 'owner'), ('m2', 'org-b', 'bob', 'owner'), ('m3', 'org-a', 'cy', 'member'), ('m4', 'org-b', 'cy', 'admin');
    insert into auth.invitation values ('i1', 'org-a', 'bob@b.test'), ('i2', 'org-b', 'ann@a.test'), ('i3', 'org-b', 'dee@none.test');
    insert into public.member values ('p1', 'org-a'), ('p2', 'org-b');
    do $$ begin if not exists (select from pg_roles where rolname = 'scope_rls_reader') then create role scope_rls_reader nologin; end if; end $$;
    grant usage on schema auth to scope_rls_reader;
    grant select, insert, update, delete on all tables in schema auth to scope_rls_reader;
    grant select on public.member to scope_rls_reader;
    alter table auth.member enable row level security;
    alter table auth.invitation enable row level security;
    create policy one_organization on auth.member using (organization_id = current_setting('app.organization', true));
    create policy one_organization on auth.invitation using (organization_id = current_setting('app.organization', true));
  `)
})
afterAll(async () => {
  await ctx.db.destroy()
})

class RolledBack extends Error {}

// What `work` returns, with what it wrote undone.
const rolledBack = async <T>(db: Kysely<any>, work: (trx: Kysely<any>) => Promise<T>) => {
  let result: T | undefined
  try {
    await db.transaction().execute(async (trx) => {
      result = await work(trx)
      throw new RolledBack()
    })
  } catch (error) {
    if (!(error instanceof RolledBack)) throw error
  }
  return result as T
}

// How raw SQL names a scoped table: `scoped(t)` through the scope, the table itself under the policies.
type TableOf = (table: string) => RawBuilder<unknown>

// The plain query as the reader whose policies show `organization`, and the same query through the scope.
const underPolicies = <T>(organization: Organization, query: (db: Kysely<any>, table: TableOf) => Promise<T>) =>
  rolledBack(ctx.db, async (trx) => {
    await sql`set local role scope_rls_reader`.execute(trx)
    await sql`select set_config('app.organization', ${organization ?? ''}, true)`.execute(trx)
    return query(trx, sql.table)
  })
const throughScope = <T>(organization: Organization, query: (db: ScopedDb, table: TableOf) => Promise<T>) => rolledBack(ctx.db, (trx) => query(scopedDb(trx, scope, organization), scoped))

const rows = (query: { execute: () => Promise<unknown[]> }) => query.execute()

const shapes: Record<string, (db: Kysely<any>, table: TableOf) => Promise<unknown>> = {
  'a plain read': (db) => rows(db.selectFrom('auth.member').select(['id', 'role']).orderBy('id')),
  'an alias and an or': (db) => rows(db.selectFrom('auth.member as m').select('m.id').where((eb) => eb.or([eb('m.role', '=', 'owner'), eb('m.role', '=', 'admin')])).orderBy('m.id')),
  'a left join': (db) => rows(db.selectFrom('auth.user as u').leftJoin('auth.member as m', 'm.user_id', 'u.id').select(['u.id', 'm.role']).orderBy('u.id').orderBy('m.role')),
  'an inner join of two scoped tables': (db) => rows(db.selectFrom('auth.member as m').innerJoin('auth.user as u', 'u.id', 'm.user_id').innerJoin('auth.invitation as i', 'i.email', 'u.email').select(['m.id', 'i.id as invitation']).orderBy('m.id')),
  'a subquery': (db) => rows(db.selectFrom('auth.user').select('id').where('id', 'in', db.selectFrom('auth.member').select('user_id')).orderBy('id')),
  'exists': (db) => rows(db.selectFrom('auth.user as u').select('u.id').where((eb) => eb.exists(eb.selectFrom('auth.invitation as i').select('i.id').whereRef('i.email', '=', 'u.email'))).orderBy('u.id')),
  'a common table expression': (db) => rows(db.with('owners', (q) => q.selectFrom('auth.member').select('user_id').where('role', '=', 'owner')).selectFrom('owners').select('user_id').orderBy('user_id')),
  'a union': (db) => rows(db.selectFrom('auth.member').select('id').union(db.selectFrom('auth.invitation').select('id')).orderBy('id')),
  'a count in the select': (db) => rows(db.selectFrom('auth.user as u').select((eb) => ['u.id', eb.selectFrom('auth.member as m').whereRef('m.user_id', '=', 'u.id').select(eb.fn.countAll<string>().as('n')).as('memberships')]).orderBy('u.id')),
  "the project's own table of the same name": (db) => rows(db.selectFrom('member').select('id').orderBy('id')),
  'raw SQL through scoped()': async (db, table) => (await sql`select id from ${table('auth.member')} as m order by id`.execute(db)).rows,
  'update … from': (db) => rows(db.updateTable('auth.member as m').set({ role: 'invited' }).from('auth.invitation as i').from('auth.user as u').whereRef('u.id', '=', 'm.user_id').whereRef('i.email', '=', 'u.email').returning('m.id')),
  'delete … using': (db) => rows(db.deleteFrom('auth.invitation').using('auth.user').whereRef('auth.user.email', '=', 'auth.invitation.email').returning('auth.invitation.id')),
}

describe('the organization scope on real Postgres', () => {
  for (const [shape, query] of Object.entries(shapes)) {
    it(`returns the rows row-level security returns: ${shape}`, async () => {
      for (const organization of ['org-a', 'org-b', undefined]) {
        expect(await throughScope(organization, query)).toEqual(await underPolicies(organization, query))
      }
    })
  }

  it('copies no row of another organization with insert … select, and writes its own', async () => {
    const copied = await throughScope('org-a', async (db) => {
      await db.insertInto('auth.invitation').columns(['id', 'email']).expression(db.selectFrom('auth.member').select([sql<string>`'copy-' || id`.as('id'), 'user_id'])).execute()
      return db.unscoped('the test reads what the insert wrote in every organization').selectFrom('auth.invitation').select(['id', 'organization_id']).where('id', 'like', 'copy-%').orderBy('id').execute()
    })
    expect(copied).toEqual([{ id: 'copy-m1', organization_id: 'org-a' }, { id: 'copy-m3', organization_id: 'org-a' }])
  })

  it("refuses an insert naming another organization, and one without an organization", async () => {
    await expect(throughScope('org-a', (db) => db.insertInto('auth.member').values({ id: 'm9', organization_id: 'org-b', user_id: 'dee', role: 'member' }).execute())).rejects.toThrow(ScopeRefused)
    await expect(throughScope(undefined, (db) => db.insertInto('auth.member').values({ id: 'm9', user_id: 'dee', role: 'member' }).execute())).rejects.toThrow(ScopeRefused)
  })

  it("leaves another organization's row as it is on an upsert's conflict", async () => {
    const after = await throughScope('org-a', async (db) => {
      await db.insertInto('auth.member').values({ id: 'm2', user_id: 'bob', role: 'member' }).onConflict((oc) => oc.column('id').doUpdateSet({ role: 'taken' })).execute()
      return db.unscoped('the test reads the row of the other organization').selectFrom('auth.member').select(['organization_id', 'role']).where('id', '=', 'm2').executeTakeFirst()
    })
    expect(after).toEqual({ organization_id: 'org-b', role: 'owner' })
  })
})
