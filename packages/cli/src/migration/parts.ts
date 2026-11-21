import { authSchemaMigration, callsMigration, changesMigration, channelSendsMigration, commentsMigration, computedMigration, capturedBy, derivedMigration, hasBuckets, jobsSchemaMigration, mailFeedbackMigration, mailFeedbackResource, ownedDefinitionsMigration, notificationsMigration, queryRunnerMigration, realtimeRelayMigration, relayed, relayMigration, sqlSends, statusMigration, unsubscribesMigration, userTablesMigration, webhooksMigration, workflowsMigration } from '@protobase/server'
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
  // Mail feedback's events are captured from its table, which its own file, before the changes one, creates.
  const feedback = project.mailFeedback ? [mailFeedbackResource.toModel()] : []
  const captured = [...project.models, ...feedback]
  return [
    ...(project.auth ? [{ name: 'auth', title: authMigrationTitle, sql: () => authSchemaMigration(project.auth!) }] : []),
    // Events and history are captured with a dispatch job, events delivered, mentions mailed, AI fields filled and
    // notifications sent by jobs, whose waiting and failed ones webhooks lists, workflows run by them, and time rollups
    // refreshed by one.
    ...(project.jobs.length > 0 || captured.some(capturedBy(captured)) || comments || aiFields || project.models.some(hasBuckets) || project.webhooks || project.workflows || project.notifications || project.realtime?.relay ? [{ name: 'jobs', title: 'The jobs schema this version of Protobase needs', sql: () => jobsSchemaMigration(project.db) }] : []),
    ...(project.mailFeedback ? [{ name: 'mail_feedback', title: 'The table of the bounces and complaints of the mail the app sends', sql: () => mailFeedbackMigration(project.db) }] : []),
    { name: 'changes', title: "The change capture the resources' events and history need", sql: () => changesMigration(project.db, captured, project.events, feedback.map((model) => model.name)) },
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
    ...(project.unsubscribe ? [{ name: 'unsubscribes', title: 'The table of who unsubscribed from which topic of the bulk mail', sql: () => unsubscribesMigration(project.db) }] : []),
    ...(project.calls ? [{ name: 'calls', title: 'The calls on records, who is in them, whom they ring, their guests, and the signals between the processes serving the app', sql: () => callsMigration(project.db, project.events) }] : []),
    ...(relayed(project.realtime) ? [{ name: 'realtime_relay', title: 'The relay of Realtime broadcasts and presence between the processes serving the app', sql: () => realtimeRelayMigration(project.db) }] : []),
    ...(project.userTables ? [{ name: 'user_tables', title: 'The schemas of the tables users add and of their definitions, and pg_trgm', sql: () => userTablesMigration(project.db) }] : []),
    // Run after the deploy that brought the code of an ejected table, so its definition goes in a later deploy.
    ...(project.userTables ? [{ name: 'owned_definitions', title: 'The delete of the definitions of user tables that resources in code own now', sql: () => ownedDefinitionsMigration(project.db, project.models) }] : []),
    // After the jobs schema, whose enqueue the trigger calls.
    ...(project.realtime?.relay ? [{ name: 'relay', title: "The trigger that closes a deleted sign-in session's sockets on the realtime relay", sql: () => relayMigration(project.db, project.auth) }] : []),
    ...(sqlSends(project.realtime) ? [{ name: 'channel_sends', title: "SQL's broadcasts to the record channels, channels.send()", sql: () => channelSendsMigration(project.db) }] : []),
  ]
}
