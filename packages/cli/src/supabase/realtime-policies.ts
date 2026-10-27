import { realtimeSchemaSql } from './realtime-schema'
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
 * The migration that makes Supabase's `realtime` schema (`realtimeSchemaSql`) with the source's policies on
 * `realtime.messages`, which decide who may join, hear and send on a private channel of `/api/sb/realtime/v1`. The
 * role that applies it owns the table; the server's probes, and its reads of the messages the database broadcasts,
 * need the app's database role to own it or to bypass row security.
 */
export const realtimeMigration = (policies: readonly RealtimePolicy[]) =>
  [
    '-- realtime.messages of a Supabase database with its row security policies, which authorize private Realtime\n',
    '-- channels, and realtime.send() and realtime.broadcast_changes(), which broadcast from the database, written by\n',
    '-- `protobase import supabase`.\n\n',
    realtimeSchemaSql,
    '\n',
    ...policies.map(policySql),
  ].join('')
