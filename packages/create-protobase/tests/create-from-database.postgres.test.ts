import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as scaffold from '@protobase/cli/scaffold'
import { sql, type Kysely } from 'kysely'
import { describe, expect, it } from 'vitest'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { databaseSteps } from '../src/database-steps'
import { createFromDatabase } from '../src/database-wizard'

const ready = await postgresTemplateReady('empty')

// A scratch template with what scaffold reads and writes beside: config/index.ts, package.json and .env.example.
const template = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'create-protobase-template-'))
  mkdirSync(path.join(dir, 'config'))
  writeFileSync(path.join(dir, 'config', 'index.ts'), "export { usersPage } from '@protobase/layout'\n")
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'scratch', private: true, scripts: { dev: 'protobase dev' } }))
  writeFileSync(path.join(dir, '.env.example'), 'DATABASE_URL=postgres://protobase:protobase@localhost:55432/scratch\nPROTOBASE_SECRET=change-me\n')
  return dir
}

const tables = `
  create schema shop;
  create table shop.customers (id bigint generated always as identity primary key, name text not null, email text);
  create table shop.orders (id bigint generated always as identity primary key, customer_id bigint not null references shop.customers, total numeric(12, 2) not null);
  create table shop.notes (id bigint generated always as identity primary key, body text not null);
  create table shop.audit_log (at timestamptz not null default now(), message text);
  create view shop.order_totals as select customer_id, sum(total) as total from shop.orders group by customer_id;
`

// Every relation and column of the database, to see that the wizard changed none.
const shape = async (db: Kysely<any>) =>
  (await sql`select table_schema, table_name, column_name from information_schema.columns where table_schema not in ('pg_catalog', 'information_schema') order by 1, 2, 3`.execute(db)).rows

describe.skipIf(!ready)('npm create protobase <database-url> on Postgres', () => {
  it('imports the tables picked and those they point to with the scaffold of the CLI, leaves out the rest and writes nothing to the database', async () => {
    const database = await openPostgresDatabase('empty')
    await database.exec(tables)
    const before = await shape(database.db)

    const dir = path.join(mkdtempSync(path.join(tmpdir(), 'create-protobase-')), 'shop')
    const answers = ['orders, notes', '', '']
    let printed = ''
    const terminal = { ask: async () => answers.shift() ?? '', print: (text: string) => void (printed += text), closePrompt: () => {} }
    const steps = databaseSteps({ templateDir: template(), secret: 'abc', tools: { bun: true, docker: false }, terminal, loadScaffold: async () => scaffold })
    await createFromDatabase(database.url, dir, terminal, { ...steps, install: async () => {} })

    const read = (...parts: string[]) => readFileSync(path.join(dir, ...parts), 'utf8')
    expect(read('.env')).toBe(`DATABASE_URL=${database.url}\nPROTOBASE_SECRET=abc\n`)
    expect(read('config', 'customers', 'data.ts')).toContain("export const customers = resource('customers')")
    expect(read('config', 'orders', 'data.ts')).toContain("customer_id: f.relation('customers')")
    expect(read('config', 'orders', 'ui.ts')).toContain('.list(')
    expect(read('config', 'index.ts')).toContain("export { orders } from './orders/data'")
    expect(read('config', 'index.ts')).toContain("export { notes } from './notes/data'")
    expect(printed).toMatch(/1\. shop\.customers +3 columns\n/)
    expect(printed).toContain('  and shop.customers, which they point to\n')
    expect(printed).toContain('  shop.order_totals: a view\n  shop.audit_log: no primary key or unique NOT NULL index\n')
    expect(printed).toContain(`created ${path.join(dir, 'config', 'customers', 'data.ts')}\n`)
    expect(await shape(database.db)).toEqual(before)
  })
})
