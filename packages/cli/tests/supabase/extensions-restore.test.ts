import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'
import { importPlan, probedExtensions } from '../../src/supabase/import-plan'
import { replayScript } from '../../src/supabase/replay'
import { schemaMigration } from '../../src/supabase/schema-migration'
import { extensionProbe } from '../../src/supabase/target-extensions'

// fixtures/supabase-extensions-schema.sql is a schema dump of Supabase's own Postgres image (supabase/postgres:17.11.0.006,
// with Supabase's init and its docker/volumes/db/webhooks.sql), with the app in fixtures/supabase-extensions-app.sql
// made as `postgres`, taken as `protobase import supabase` takes it, for the public schema alone: pg_dump --schema-only
// --no-owner --schema=public, as the role postgres. The extensions, triggers, secrets and queues below are what the
// import read from that database.

const dump = readFileSync(new URL('fixtures/supabase-extensions-schema.sql', import.meta.url), 'utf8')
const extensions = [
  { name: 'pg_cron', schema: 'pg_catalog' },
  { name: 'pg_net', schema: 'extensions' },
  { name: 'pg_stat_statements', schema: 'extensions' },
  { name: 'pgcrypto', schema: 'extensions' },
  { name: 'pgmq', schema: 'pgmq' },
  { name: 'plpgsql', schema: 'pg_catalog' },
  { name: 'supabase_vault', schema: 'vault' },
  { name: 'uuid-ossp', schema: 'extensions' },
]
const httpTriggers = [{ schema: 'public', table: 'orders', trigger: 'order_placed', function: 'supabase_functions.http_request' }]
const secrets = [
  { name: 'stripe_key', description: 'Stripe secret key', secret: 'sk_test_51abc' },
  { name: 'webhook_secret', description: '', secret: 'whsec_xyz' },
]
const queues = [
  {
    name: 'receipts',
    unlogged: false,
    partitioned: false,
    messages: [
      { message: '{"email": "alice@example.com", "order": 1}', headers: null, visibleAt: '2026-10-20 12:03:01.044749+00' },
      { message: '{"email": "bob@example.com", "order": 2}', headers: null, visibleAt: '2026-10-20 12:03:01.045436+00' },
    ],
  },
  { name: 'events', unlogged: true, partitioned: false, messages: [{ message: '{"kind": "later"}', headers: '{"source": "app"}', visibleAt: '2030-01-01 00:00:00+00' }] },
]

it("restores a Supabase database's Vault secrets, pgmq queues and Database Webhooks on Supabase's image as its tenant", async () => {
  const database = await openSnapshotDb('supabaseTenant')
  // The tenant a dedicated instance gives the app: it owns its database, and is no superuser.
  await database.exec(`
    do $$ begin execute format('alter database %I owner to postgres', current_database()); end $$;
    set role postgres;
  `)

  const [, , probed] = await database.exec(extensionProbe(probedExtensions(extensions)).join(';\n'))
  const creatable = new Set(probed!.rows.filter((row) => row.creatable).map((row) => row.name as string))
  // pg_cron runs in the instance's own database alone, not in this copy of it.
  expect([...creatable]).toEqual(['pg_net', 'pgcrypto', 'pgmq', 'supabase_vault', 'uuid-ossp'])

  const plan = importPlan({ extensions, httpTriggers }, creatable)
  const migration = schemaMigration(dump, { schemas: ['public'], extensions: plan.extensions, webhooks: plan.webhooks, missing: plan.missing, encryptedColumns: [] })
  expect(plan.leftOut.map((extension) => extension.name)).toEqual(['pg_cron'])
  expect(migration.text).toContain('\nCREATE TRIGGER order_placed AFTER INSERT ON public.orders')

  await database.exec('begin')
  await database.exec(migration.text)
  await database.exec(replayScript({ secrets, queues, cronJobs: [] }))
  // An order placed through the API fires the webhook and queues its receipt.
  await database.exec("set local role anon; insert into public.orders (email, total) values ('carol@example.com', 9.75); set local role postgres")
  const [key] = await database.exec('select public.payment_key() as key')
  const [requests] = await database.exec("select method, url, convert_from(body, 'utf8')::jsonb #>> '{record,email}' as email from net.http_request_queue order by id")
  const [receipts] = await database.exec("select message from pgmq.read('receipts', 30, 10) order by msg_id")
  const [events] = await database.exec("select count(*)::int as queued, (select count(*)::int from pgmq.read('events', 30, 10)) as visible from pgmq.q_events")
  const [headers] = await database.exec('select headers from pgmq.q_events')
  await database.exec('rollback')

  expect(key!.rows).toEqual([{ key: 'sk_test_51abc' }])
  expect(requests!.rows).toEqual([{ method: 'POST', url: 'http://127.0.0.1:1/hooks/order', email: 'carol@example.com' }])
  expect(receipts!.rows.map((row) => row.message)).toEqual([
    { email: 'alice@example.com', order: 1 },
    { email: 'bob@example.com', order: 2 },
    { email: 'carol@example.com', order: 1 },
  ])
  // The message stays invisible until the time it had in Supabase.
  expect(events!.rows).toEqual([{ queued: 1, visible: 0 }])
  expect(headers!.rows).toEqual([{ headers: { source: 'app' } }])
})
