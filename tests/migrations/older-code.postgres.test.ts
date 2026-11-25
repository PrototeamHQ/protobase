import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { bucketsCommentPrefix } from '@protobase/server/internal'
import { trialContractions } from '../../packages/cli/src/migration/older-code/trial'
import { runMigration } from '../../packages/cli/src/migration/snapshot/run-migration'
import { openPostgresDatabase, postgresTemplateReady } from '../../test-support/postgres-database'

// What a migration takes from the code still running while it deploys, read by applying it to real Postgres in a
// transaction that is rolled back.

const ordersSql = `create schema sales;
create table sales.orders (id integer primary key, code text, total integer generated always as (id * 2) stored);
create function sales.capture() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger orders_capture after insert on sales.orders for each row execute function sales.capture();
insert into sales.orders (id, code) values (1, 'a');`

const section = (name: string, text: string) => ({ name, text })

describe.skipIf(!(await postgresTemplateReady('empty')))('what a migration takes from older code, on real Postgres', () => {
  it('finds nothing in what only adds or replaces, and leaves the database as it was', async () => {
    const database = await openPostgresDatabase('empty')
    await database.exec(ordersSql)
    const adds = section('changes', `alter table sales.orders add column note text, alter column code set default 'x';
create table sales.lines (id integer primary key, order_id integer not null references sales.orders (id));
drop trigger orders_capture on sales.orders;
create trigger orders_capture_v2 after insert or update on sales.orders for each row execute function sales.capture();
alter table sales.orders drop column total;
alter table sales.orders add column total integer generated always as (id * 3) stored;`)
    expect(await trialContractions(database.url, [adds])).toEqual([])
    const { rows } = await sql<{ name: string }>`select table_name || '.' || column_name as name from information_schema.columns where table_schema = 'sales' order by 1`.execute(database.db)
    expect(rows.map(({ name }) => name)).toEqual(['orders.code', 'orders.id', 'orders.total'])
  })

  it('names what a rename, a drop or a new limit takes, by the section that takes it', async () => {
    const database = await openPostgresDatabase('empty')
    await database.exec(ordersSql)
    const found = await trialContractions(database.url, [
      section('auth', 'create table sales.audit (id integer)'),
      section('computed', 'alter table sales.orders rename column code to reference'),
      section('changes', "drop trigger orders_capture on sales.orders;\nalter table sales.orders add constraint code_set check (id > 0)"),
    ])
    expect(found).toEqual([
      { name: 'computed', found: ['drops or renames column sales.orders.code'] },
      { name: 'changes', found: ['adds the constraint code_set to sales.orders, which rows written by older code may break', 'drops or disables the trigger calling sales.capture() on sales.orders for insert'] },
    ])
  })

  it('names a later section that changes what an earlier one took, under that section too', async () => {
    const database = await openPostgresDatabase('empty')
    await database.exec(ordersSql)
    const found = await trialContractions(database.url, [
      section('auth', 'alter table sales.orders add constraint code_set check (code is not null) not valid'),
      section('computed', "alter table sales.orders drop constraint code_set;\nalter table sales.orders add constraint code_set check (code <> '') not valid"),
    ])
    const line = 'adds the constraint code_set to sales.orders, which rows written by older code may break'
    expect(found).toEqual([
      { name: 'auth', found: [line] },
      { name: 'computed', found: [line] },
    ])
  })

  it('refuses to write a migration that renames, pointing at a hand-written file that breaks older code', async () => {
    const database = await openPostgresDatabase('empty')
    await database.exec(ordersSql)
    const projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-older-code-'))
    const dir = path.join(projectDir, 'db/migrations')
    const rename = { name: 'computed', title: 'A rename', sql: async () => 'alter table sales.orders rename to purchases;' }
    const run = runMigration({ projectDir, dir, auth: undefined, modules: [], database: { url: database.url, parts: [rename], contractions: (sections) => trialContractions(database.url, sections), readModule: async () => undefined }, protobaseVersion: '1.0.0', newId: () => 'id' })
    await expect(run).rejects.toThrow(
      'The migration would break the code still running while it deploys, and the version before it once rolled back: computed drops, renames or moves table sales.orders. To make it anyway, write it by hand with `protobase migration --custom <name>` and put `-- protobase:breaks-older-code` among its `-- protobase:` lines',
    )
    expect(await readdir(projectDir)).toEqual([])
    await rm(projectDir, { recursive: true, force: true })
  })

  it("writes a changed time rollup, whose table of recomputed rows is made again, as taking nothing", async () => {
    const database = await openPostgresDatabase('empty')
    const rollup = (comment: string, measure: string) => `create table sales.daily (day date primary key, ${measure} bigint not null);
comment on table sales.daily is '${bucketsCommentPrefix}${comment}';
insert into sales.daily select current_date, 1;`
    await database.exec(`${ordersSql}\n${rollup('v1', 'orders')}`)
    const changed = { name: 'computed', title: 'A changed time rollup', sql: async () => `drop table sales.daily;\n${rollup('v2', 'orders')}\nalter table sales.daily add column total bigint` }
    const projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-older-code-'))
    const dir = path.join(projectDir, 'db/migrations')
    const file = await runMigration({ projectDir, dir, auth: undefined, modules: [], database: { url: database.url, parts: [changed], contractions: (sections) => trialContractions(database.url, sections), readModule: async () => undefined }, protobaseVersion: '1.0.0', newId: () => 'id' })
    expect(await readFile(file!, 'utf8')).not.toContain('breaks-older-code')
    expect(await trialContractions(database.url, [section('computed', `drop table sales.daily;\n${rollup('v2', 'count')}`)])).toEqual([{ name: 'computed', found: ['drops or renames column sales.daily.orders'] }])
    await rm(projectDir, { recursive: true, force: true })
  })
})
