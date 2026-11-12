import { authSchemaMigration, callsMigration, changesMigration, channelSendsMigration, commentsMigration, computedMigration, capturedBy, derivedMigration, jobsSchemaMigration, ownedDefinitionsMigration, notificationsMigration, queryRunnerMigration, realtimeRelayMigration, relayed, sqlSends, statusMigration, userTablesMigration, webhooksMigration, workflowsMigration } from '@protobase/server'
import { authMigrationTitle } from '../auth/migration-file'
import type { MigrationProject } from './load-project'

/** What one feature still needs of the database, written as a migration file of its own. */
export type MigrationPart = {
  /** The file name after its number. */
  name: string
  /** What the statements are, the file's first line. */
  title: string
  /** The statements, compared with the database; `undefined` when it is current. */
  sql: () => Promise<string | undefined>
}

/** Every feature the project's config enables, in the order their files are written. */
export const migrationParts = (project: MigrationProject): MigrationPart[] => {
  const comments = project.models.some((model) => model.comments)
  const aiFields = project.models.some((model) => Object.values(model.fields).some((field) => field.ai))
  return [
    ...(project.auth ? [{ name: 'auth', title: authMigrationTitle, sql: () => authSchemaMigration(project.auth!) }] : []),
    // Events and history are captured with a dispatch job, events delivered, mentions mailed, AI fields filled and
    // notifications sent by jobs, whose waiting and failed ones webhooks lists, and workflows run by them.
    ...(project.jobs.length > 0 || project.models.some(capturedBy(project.models)) || comments || aiFields || project.webhooks || project.workflows || project.notifications ? [{ name: 'jobs', title: 'The jobs schema this version of Protobase needs', sql: () => jobsSchemaMigration(project.db) }] : []),
    { name: 'changes', title: "The change capture the resources' events and history need", sql: () => changesMigration(project.db, project.models, project.events) },
    // Always compared, so that the function and trigger of a rollup the config no longer has are dropped.
    { name: 'computed', title: "The columns of the resources' rollup and formula fields, the triggers that keep the rollups, and the tables and refresh functions of their time rollups", sql: () => computedMigration(project.db, project.models) },
    ...(project.readOnlyQueries
      ? [{ name: 'query', title: "The role the assistant's read-only queries run as, which reads only the resources' tables", sql: () => queryRunnerMigration(project.db, project.models, project.authTables) }]
      : []),
    // After the jobs schema: a newly declared derived value enqueues the job that computes its records once. Always
    // compared, so that the state of a derived value the config no longer has is dropped.
    { name: 'derived', title: "The state of the resources' derived values and what they read", sql: () => derivedMigration(project.db, project.models) },
    ...(comments ? [{ name: 'comments', title: 'The comments table of the resources with comments', sql: () => commentsMigration(project.db) }] : []),
    ...(project.webhooks ? [{ name: 'webhooks', title: 'The webhook subscriptions of webhooks', sql: () => webhooksMigration(project.db, project.webhooks, project.events) }] : []),
    ...(project.workflows ? [{ name: 'workflows', title: 'The workflows, their versions, runs and steps', sql: () => workflowsMigration(project.db, project.workflows) }] : []),
    // A store of the app's own keeps the devices elsewhere: nothing to write.
    ...(project.notifications && !(project.notifications.store && project.notifications.historyStore)
      ? [{ name: 'notifications', title: 'The tables of notifications', sql: () => notificationsMigration(project.db, project.notifications, project.auth) }]
      : []),
    ...(project.status ? [{ name: 'status', title: "The statuses table of people's own status", sql: () => statusMigration(project.db, project.status!, project.auth) }] : []),
    ...(project.calls ? [{ name: 'calls', title: 'The calls on records, who is in them, whom they ring, their guests, and the signals between the processes serving the app', sql: () => callsMigration(project.db, project.events) }] : []),
    ...(relayed(project.realtime) ? [{ name: 'realtime_relay', title: 'The relay of Realtime broadcasts and presence between the processes serving the app', sql: () => realtimeRelayMigration(project.db) }] : []),
    ...(project.userTables ? [{ name: 'user_tables', title: 'The schemas of the tables users add and of their definitions, and pg_trgm', sql: () => userTablesMigration(project.db) }] : []),
    // Run after the deploy that brought the code of an ejected table, so its definition goes in a later deploy.
    ...(project.userTables ? [{ name: 'owned_definitions', title: 'The delete of the definitions of user tables that resources in code own now', sql: () => ownedDefinitionsMigration(project.db, project.models) }] : []),
    ...(sqlSends(project.realtime) ? [{ name: 'channel_sends', title: "SQL's broadcasts to the record channels, channels.send()", sql: () => channelSendsMigration(project.db) }] : []),
  ]
}
