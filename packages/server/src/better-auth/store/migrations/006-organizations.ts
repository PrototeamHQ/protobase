import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** Organizations, their members and invitations, and the organization each user and session works in. */
export const organizations: StoreMigration = {
  version: 6,
  name: 'organizations',
  title: 'Organizations, their members and their invitations',
  tables: ['organization', 'member', 'invitation'],
  statements: ({ table, user, userDdl, id, idRef }) => {
    const organization = table('organization')
    const o = organization.columns
    const member = table('member')
    const m = member.columns
    const invitation = table('invitation')
    const i = invitation.columns
    return [
      ...userDdl([ddl`alter table ${table('user')} add column if not exists ${table('user').columns.last_organization_id} text`]),
      ddl`alter table ${table('session')} add column ${table('session').columns.active_organization_id} text`,
      ddl`create table ${organization} (
  id ${id} primary key,
  ${o.name} text not null,
  ${o.slug} text not null unique,
  ${o.logo} text,
  ${o.created_at} timestamptz not null,
  ${o.metadata} text
)`,
      ddl`create table ${member} (
  id ${id} primary key,
  ${m.organization_id} ${idRef} not null references ${organization} (id) on delete cascade,
  ${m.user_id} ${idRef} not null references ${user} (id) on delete cascade,
  ${m.role} text not null,
  ${m.created_at} timestamptz not null,
  ${m.app_roles} jsonb
)`,
      ddl`create index ${member.index('member_organization_id_idx')} on ${member} (${m.organization_id})`,
      ddl`create index ${member.index('member_user_id_idx')} on ${member} (${m.user_id})`,
      ddl`create table ${invitation} (
  id ${id} primary key,
  ${i.organization_id} ${idRef} not null references ${organization} (id) on delete cascade,
  ${i.email} text not null,
  ${i.role} text,
  ${i.status} text not null,
  ${i.expires_at} timestamptz not null,
  ${i.created_at} timestamptz default current_timestamp not null,
  ${i.inviter_id} ${idRef} not null references ${user} (id) on delete cascade,
  ${i.app_roles} jsonb
)`,
      ddl`create index ${invitation.index('invitation_organization_id_idx')} on ${invitation} (${i.organization_id})`,
      ddl`create index ${invitation.index('invitation_email_idx')} on ${invitation} (${i.email})`,
    ]
  },
}
