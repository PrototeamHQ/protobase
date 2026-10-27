import { isSupabaseRole } from './rewrite'

/** A row security policy on Supabase's `realtime.messages`, its expressions with every name schema-qualified. */
export type RealtimePolicy = {
  name: string
  permissive: boolean
  /** The roles it applies to, `public` for every role. */
  roles: string[]
  command: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  using: string | null
  withCheck: string | null
}

type Query = (text: string, params?: unknown[]) => Promise<readonly Record<string, unknown>[]>

/**
 * The source's row security policies on `realtime.messages`, which authorize private Realtime channels, their
 * expressions read with an empty search_path so that every name in them is schema-qualified; it is put back after, for
 * the reads that follow in the same transaction.
 */
export const realtimePolicies = async (query: Query) => {
  const [setting] = await query("select current_setting('search_path') as path")
  await query("select set_config('search_path', '', true)")
  const policies = await query(`select policyname as name, permissive = 'PERMISSIVE' as permissive, roles::text[] as roles, cmd as command, qual as "using", with_check as "withCheck"
    from pg_policies where schemaname = 'realtime' and tablename = 'messages' order by policyname`)
  await query("select set_config('search_path', $1, true)", [setting!.path])
  return policies as RealtimePolicy[]
}

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

// The columns of Supabase's realtime.messages, which policies may read, unpartitioned: Protobase inserts its probe
// messages only in transactions it rolls back.
const schema = `create schema realtime;

create table realtime.messages (
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean,
  updated_at timestamp without time zone not null default now(),
  inserted_at timestamp without time zone not null default now(),
  id uuid not null default gen_random_uuid() primary key
);

create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '')::text $$;

alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert, update, delete on realtime.messages to anon, authenticated, service_role;
`

const policySql = (policy: RealtimePolicy) => {
  const roles = policy.roles.filter((role) => !isSupabaseRole(role))
  // JSON's quoting keeps a name with a line break inside the comment.
  if (roles.length === 0) return `-- Left out by protobase import supabase: the policy ${JSON.stringify(policy.name)} names only Supabase's own roles.\n`
  return [
    `create policy ${quoted(policy.name)} on realtime.messages as ${policy.permissive ? 'permissive' : 'restrictive'} for ${policy.command}`,
    ` to ${roles.map((role) => (role === 'public' ? 'public' : quoted(role))).join(', ')}`,
    policy.using === null ? '' : ` using (${policy.using})`,
    policy.withCheck === null ? '' : ` with check (${policy.withCheck})`,
    ';\n',
  ].join('')
}

/**
 * The migration that makes Supabase's `realtime.messages` and `realtime.topic()` with the source's policies on it, which
 * decide who may join, hear and send on a private channel of `/api/sb/realtime/v1`. The role that applies it owns the
 * table; the server's probes need the app's database role to own it or to bypass row security.
 */
export const realtimeMigration = (policies: readonly RealtimePolicy[]) =>
  [
    '-- realtime.messages of a Supabase database with its row security policies, which authorize private Realtime\n',
    '-- channels, written by `protobase import supabase`.\n\n',
    schema,
    '\n',
    ...policies.map(policySql),
  ].join('')
