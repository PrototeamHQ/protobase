import { qualified } from '../notifications/schema-sql'
import type { ResourceReplaceable, SchemaModule } from '../schema-modules/schema-module'
import { dropMemberTableSql, memberTableSql, organizationMembersVersion, type MemberTable } from './organization-members-sql'
import { readRelay } from './read-relay'
import { dropListedSql, listedTableSql, membersFunctionsSql, membersTableSql, membersVersion, type ListedTable } from './realtime-members-sql'
import { sessionsSql, sessionsVersion } from './sessions-sql'

const statements = (list: readonly string[]) => `${list.join(';\n\n')};`

/** The triggers that keep `realtime.members` from one channel resource's records that list their members. */
const members: ResourceReplaceable = {
  name: 'members',
  title: 'The triggers that keep realtime.members',
  version: 1,
  compatibleFrom: 1,
  sql: (_names, input) => statements(listedTableSql(input as ListedTable)),
  drop: (_names, table) => statements(dropListedSql(qualified({ schema: table.schema, table: table.name }))),
  keptWhileOthers: false,
}

/**
 * The trigger on the auth store's member table that moves people in and out of the channels that reach their whole
 * organization, written while a channel resource has such records, under the key `member`.
 */
const organization: ResourceReplaceable = {
  name: 'organization',
  title: "The triggers that follow who is in an organization for the relay's organization-wide channels",
  version: organizationMembersVersion,
  compatibleFrom: organizationMembersVersion,
  sql: (_names, input) => statements(memberTableSql(input as MemberTable)),
  drop: (_names, table) => statements(dropMemberTableSql(qualified({ schema: table.schema, table: table.name }))),
  keptWhileOthers: false,
}

/**
 * What the realtime relay needs of the app's database: the trigger that closes a deleted sign-in session's sockets, on
 * the sessions table the auth store names (`names.sessions`, as SQL names it), which queues a job, so it is written
 * after the auth store's steps and the jobs schema; and `realtime.members` with the triggers that keep it from the
 * channel records that list their members, and with organization-wide channels the trigger that follows the auth
 * store's member table. Its table is never dropped.
 */
export const relayModule: SchemaModule = {
  label: 'the realtime relay',
  title: "The trigger that closes a deleted sign-in session's sockets on the realtime relay, and realtime.members with the triggers that keep it from the channel records that list their members",
  steps: [{ step: 1, name: 'members', title: 'The realtime.members table', additive: true, sql: () => statements(membersTableSql) }],
  replaceables: [
    // Not marked compatible with an earlier version: the code of one before it is not known to run on it.
    { name: 'sessions', title: "The trigger that closes a deleted session's sockets", version: sessionsVersion, compatibleFrom: sessionsVersion, sql: (names) => statements(sessionsSql(names.sessions!)) },
    { name: 'members', title: 'The functions that keep realtime.members', version: membersVersion, compatibleFrom: membersVersion, sql: () => statements(membersFunctionsSql) },
  ],
  resourceReplaceables: [members, organization],
  read: readRelay(members, organization),
}
