import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** Sign-in itself: users, with their roles and bans, sessions, accounts, codes and the token signing keys. */
export const core: StoreMigration = {
  version: 1,
  name: 'core',
  title: "Better Auth's users, sessions, accounts, verifications and signing keys",
  tables: ['session', 'account', 'verification', 'jwks'],
  statements: ({ table, user, userDdl, metadata, id, idRef }) => {
    const u = table('user').columns
    const session = table('session')
    const s = session.columns
    const account = table('account')
    const a = account.columns
    const verification = table('verification')
    const v = verification.columns
    const jwks = table('jwks')
    const j = jwks.columns
    return [
      ...userDdl([
        ddl`create table if not exists ${table('user')} (id ${id} primary key)`,
        ddl`alter table ${table('user')}
  add column if not exists ${u.name} text not null,
  add column if not exists ${u.email} text not null unique,
  add column if not exists ${u.email_verified} boolean not null,
  add column if not exists ${u.image} text,
  add column if not exists ${u.created_at} timestamptz default current_timestamp not null,
  add column if not exists ${u.updated_at} timestamptz default current_timestamp not null,
  add column if not exists ${u.role} text,
  add column if not exists ${u.banned} boolean,
  add column if not exists ${u.ban_reason} text,
  add column if not exists ${u.ban_expires} timestamptz,
  add column if not exists ${u.last_role} text,
  add column if not exists ${u.email_confirmed_at} timestamptz`,
        ...(metadata ? [ddl`alter table ${table('user')} add column if not exists ${metadata} jsonb`] : []),
      ]),
      ddl`create table ${session} (
  id ${id} primary key,
  ${s.expires_at} timestamptz not null,
  ${s.token} text not null unique,
  ${s.created_at} timestamptz default current_timestamp not null,
  ${s.updated_at} timestamptz not null,
  ${s.ip_address} text,
  ${s.user_agent} text,
  ${s.user_id} ${idRef} not null references ${user} (id) on delete cascade,
  ${s.impersonated_by} text,
  ${s.active_role} text
)`,
      ddl`create index ${session.index('session_user_id_idx')} on ${session} (${s.user_id})`,
      ddl`create table ${account} (
  id ${id} primary key,
  ${a.account_id} text not null,
  ${a.provider_id} text not null,
  ${a.user_id} ${idRef} not null references ${user} (id) on delete cascade,
  ${a.access_token} text,
  ${a.refresh_token} text,
  ${a.id_token} text,
  ${a.access_token_expires_at} timestamptz,
  ${a.refresh_token_expires_at} timestamptz,
  ${a.scope} text,
  ${a.password} text,
  ${a.created_at} timestamptz default current_timestamp not null,
  ${a.updated_at} timestamptz not null
)`,
      ddl`create index ${account.index('account_user_id_idx')} on ${account} (${a.user_id})`,
      ddl`create table ${verification} (
  id ${id} primary key,
  ${v.identifier} text not null,
  ${v.value} text not null,
  ${v.expires_at} timestamptz not null,
  ${v.created_at} timestamptz default current_timestamp not null,
  ${v.updated_at} timestamptz default current_timestamp not null
)`,
      ddl`create index ${verification.index('verification_identifier_idx')} on ${verification} (${v.identifier})`,
      ddl`create table ${jwks} (
  id ${id} primary key,
  ${j.public_key} text not null,
  ${j.private_key} text not null,
  ${j.created_at} timestamptz not null,
  ${j.expires_at} timestamptz,
  ${j.alg} text,
  ${j.crv} text
)`,
    ]
  },
}
