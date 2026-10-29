import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** Organizations, their members and invitations, and the organization each user and session works in. */
export const organizations: StoreMigration = {
  version: 6,
  name: 'organizations',
  title: 'Organizations, their members and their invitations',
  tables: ['organization', 'member', 'invitation'],
  statements: ({ table, user, userDdl, userColumn: column, id, idRef }) => [
    ...userDdl([ddl`alter table ${user} add column if not exists ${column('last_organization_id')} text`]),
    ddl`alter table ${table('session')} add column active_organization_id text`,
    ddl`create table ${table('organization')} (
  id ${id} primary key,
  name text not null,
  slug text not null unique,
  logo text,
  created_at timestamptz not null,
  metadata text
)`,
    ddl`create table ${table('member')} (
  id ${id} primary key,
  organization_id ${idRef} not null references ${table('organization')} (id) on delete cascade,
  user_id ${idRef} not null references ${user} (id) on delete cascade,
  role text not null,
  created_at timestamptz not null,
  app_roles jsonb
)`,
    ddl`create index member_organization_id_idx on ${table('member')} (organization_id)`,
    ddl`create index member_user_id_idx on ${table('member')} (user_id)`,
    ddl`create table ${table('invitation')} (
  id ${id} primary key,
  organization_id ${idRef} not null references ${table('organization')} (id) on delete cascade,
  email text not null,
  role text,
  status text not null,
  expires_at timestamptz not null,
  created_at timestamptz default current_timestamp not null,
  inviter_id ${idRef} not null references ${user} (id) on delete cascade,
  app_roles jsonb
)`,
    ddl`create index invitation_organization_id_idx on ${table('invitation')} (organization_id)`,
    ddl`create index invitation_email_idx on ${table('invitation')} (email)`,
  ],
}
