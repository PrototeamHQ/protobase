import { expect, it } from 'vitest'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'
import { realtimeMigration, realtimePolicies } from '../../src/supabase/realtime-policies'

// Users by name, not uuid: the recording stands a uuid in for one of its own, which the policy would then hold.
const alice = 'alice'

// Supabase's auth.uid(), realtime.topic() and realtime.messages, with policies as a Supabase app writes them: alice
// hears room:1 alone and sends there, written unqualified, as the app's search_path finds them.
const source = `
  create schema auth;
  create function auth.uid() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '') $$;
  grant usage on schema auth to anon, authenticated;
  create schema realtime;
  create table realtime.messages (topic text not null, extension text not null, id uuid primary key default gen_random_uuid());
  create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '')::text $$;
  set local search_path = realtime, auth, public;
  create policy "alice hears room 1" on messages for select to authenticated using (topic() = 'room:1' and (select uid()) = '${alice}');
  create policy "alice sends to room 1" on messages for insert to authenticated with check (topic() = 'room:1' and (select uid()) = '${alice}');
  reset search_path;
`

it('carries the policies on realtime.messages over, schema-qualified, and they decide a private channel as on Supabase', async () => {
  const pg = await openSnapshotDb('empty')
  // A tenant that is no superuser, as in schema-restore.test.ts, with the API roles another test may have made.
  await pg.exec(`
    begin;
    create role supabase_realtime_tenant nologin nosuperuser nocreaterole nobypassrls;
    do $$ begin create role anon nologin noinherit; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;
    do $$ begin execute format('alter database %I owner to supabase_realtime_tenant', current_database()); end $$;
    set local role supabase_realtime_tenant;
  `)
  await pg.exec(source)
  const policies = await realtimePolicies((text, params) => pg.query(text, params).then((result) => result.rows))
  await pg.exec('drop schema realtime cascade')
  await pg.exec(realtimeMigration(policies))

  // The server's probes (channel-access.ts): a message inserted as the table's owner, then read, or one inserted, as
  // the caller, under a savepoint rolled back.
  const reads = async (sub: string | null, topic: string) => {
    const role = sub === null ? 'anon' : 'authenticated'
    const results = await pg.exec(`
      savepoint probe;
      insert into realtime.messages (id, topic, extension, private) values ('7a1c0b2e-5d4f-4e3a-9b8c-1d2e3f4a5b6c', '${topic}', 'broadcast', true);
      select set_config('role', '${role}', true), set_config('request.jwt.claim.sub', '${sub ?? ''}', true), set_config('realtime.topic', '${topic}', true);
      select count(*)::int as seen from realtime.messages;
    `)
    await pg.exec('rollback to savepoint probe')
    return results.at(-1)!.rows[0]!.seen
  }
  const writes = async (topic: string) => {
    await pg.exec(`savepoint probe; select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', '${alice}', true), set_config('realtime.topic', '${topic}', true)`)
    const sent = await pg.exec(`insert into realtime.messages (topic, extension, private) values ('${topic}', 'broadcast', true)`).then(
      () => true,
      (error: { code?: string }) => (error.code === '42501' ? false : Promise.reject(error)),
    )
    await pg.exec('rollback to savepoint probe')
    return sent
  }

  expect(policies.map(({ name, using }) => [name, using])).toEqual([
    ['alice hears room 1', `((realtime.topic() = 'room:1'::text) AND (( SELECT auth.uid() AS uid) = 'alice'::text))`],
    ['alice sends to room 1', null],
  ])
  expect([await reads(alice, 'room:1'), await reads(alice, 'room:2'), await reads(null, 'room:1'), await reads('bob', 'room:1')]).toEqual([1, 0, 0, 0])
  expect([await writes('room:1'), await writes('room:2')]).toEqual([true, false])
  await pg.exec('rollback')
})
