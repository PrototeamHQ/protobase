import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'
import { schemaMigration } from '../../src/supabase/schema-migration'

// fixtures/supabase-schema.sql is a schema dump of Supabase's own Postgres image (supabase/postgres:17.11.0.006), with
// GoTrue v2.197.0 and Storage v1.84.3 migrated on it and the app in fixtures/supabase-app.sql made as `postgres`, taken
// as `protobase import supabase` takes it: pg_dump --schema-only --no-owner --schema=auth --schema=billing
// --schema=public --schema=storage --exclude-table=auth.schema_migrations --exclude-table=storage.migrations, as the role
// postgres.

const dump = readFileSync(new URL('fixtures/supabase-schema.sql', import.meta.url), 'utf8')
const extensions = ['pg_trgm', 'pgcrypto', 'uuid-ossp'].map((name) => ({ name, schema: 'extensions' }))
// Postgres alone: no pg_net for the webhooks shim, no extension languages.
const missing = { triggerSchemas: ['supabase_functions'], languages: [] }

it('restores the dump of a Supabase database as a tenant that is no superuser and has none of its roles', async () => {
  const database = await openSnapshotDb('empty')
  const migration = schemaMigration(dump, { schemas: ['auth', 'billing', 'public', 'storage'], extensions, webhooks: false, missing })
  expect(migration.leftOut).toBe(100)

  // A cloud-style tenant: it owns its database and has the API roles' names to grant to, and nothing else.
  await database.exec(`
    begin;
    create role supabase_import_tenant nologin nosuperuser nocreaterole nobypassrls;
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    do $$ begin execute format('alter database %I owner to supabase_import_tenant', current_database()); end $$;
    set local role supabase_import_tenant;
  `)
  await database.exec(migration.text)
  const [tables] = await database.exec(`
    select n.nspname as schema, count(*)::int as tables from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('auth', 'billing', 'public', 'storage') group by 1 order by 1
  `)
  const [signUp] = await database.exec("select tgenabled as enabled from pg_trigger where tgname = 'on_auth_user_created'")
  const [policies] = await database.exec("select count(*)::int as policies from pg_policies where schemaname in ('public', 'billing', 'storage')")
  const [settings] = await database.exec("select current_setting('search_path') as search_path, current_setting('check_function_bodies') as check_function_bodies")
  await database.exec('rollback')

  expect(tables!.rows).toEqual([
    { schema: 'auth', tables: 26 },
    { schema: 'billing', tables: 1 },
    { schema: 'public', tables: 2 },
    { schema: 'storage', tables: 9 },
  ])
  expect(signUp!.rows).toEqual([{ enabled: 'O' }])
  expect(policies!.rows).toEqual([{ policies: 6 }])
  // The settings the dump changed are back for the migrations after it.
  expect(settings!.rows).toEqual([{ search_path: '"$user", public', check_function_bodies: 'on' }])
})
