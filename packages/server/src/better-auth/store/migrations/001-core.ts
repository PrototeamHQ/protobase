import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** Sign-in itself: users, with their roles and bans, sessions, accounts, codes and the token signing keys. */
export const core: StoreMigration = {
  version: 1,
  name: 'core',
  title: "Better Auth's users, sessions, accounts, verifications and signing keys",
  tables: ['session', 'account', 'verification', 'jwks'],
  statements: ({ table, user, userDdl, userColumn: column, metadata, id, idRef }) => [
    ...userDdl([
      ddl`create table if not exists ${user} (id ${id} primary key)`,
      ddl`alter table ${user}
  add column if not exists ${column('name')} text not null,
  add column if not exists ${column('email')} text not null unique,
  add column if not exists ${column('email_verified')} boolean not null,
  add column if not exists ${column('image')} text,
  add column if not exists ${column('created_at')} timestamptz default current_timestamp not null,
  add column if not exists ${column('updated_at')} timestamptz default current_timestamp not null,
  add column if not exists ${column('role')} text,
  add column if not exists ${column('banned')} boolean,
  add column if not exists ${column('ban_reason')} text,
  add column if not exists ${column('ban_expires')} timestamptz,
  add column if not exists ${column('last_role')} text,
  add column if not exists ${column('email_confirmed_at')} timestamptz`,
      ...(metadata ? [ddl`alter table ${user} add column if not exists ${metadata} jsonb`] : []),
    ]),
    ddl`create table ${table('session')} (
  id ${id} primary key,
  expires_at timestamptz not null,
  token text not null unique,
  created_at timestamptz default current_timestamp not null,
  updated_at timestamptz not null,
  ip_address text,
  user_agent text,
  user_id ${idRef} not null references ${user} (id) on delete cascade,
  impersonated_by text,
  active_role text
)`,
    ddl`create index session_user_id_idx on ${table('session')} (user_id)`,
    ddl`create table ${table('account')} (
  id ${id} primary key,
  account_id text not null,
  provider_id text not null,
  user_id ${idRef} not null references ${user} (id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz default current_timestamp not null,
  updated_at timestamptz not null
)`,
    ddl`create index account_user_id_idx on ${table('account')} (user_id)`,
    ddl`create table ${table('verification')} (
  id ${id} primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz default current_timestamp not null,
  updated_at timestamptz default current_timestamp not null
)`,
    ddl`create index verification_identifier_idx on ${table('verification')} (identifier)`,
    ddl`create table ${table('jwks')} (
  id ${id} primary key,
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null,
  expires_at timestamptz,
  alg text,
  crv text
)`,
  ],
}
