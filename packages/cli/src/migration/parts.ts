import { authSchemaMigration, changesMigration, commentsMigration, computedMigration, isCaptured, jobsSchemaMigration, notificationsMigration, queryRunnerMigration, webhooksMigration } from '@protobase/server'
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
    // notifications sent by jobs, whose waiting and failed ones webhooks() lists.
    ...(project.jobs.length > 0 || project.models.some(isCaptured) || comments || aiFields || project.webhooks || project.notifications ? [{ name: 'jobs', title: 'The jobs schema this version of Protobase needs', sql: () => jobsSchemaMigration(project.db) }] : []),
    { name: 'changes', title: "The change capture the resources' events and history need", sql: () => changesMigration(project.db, project.models, project.events) },
    // Always compared, so that the function and trigger of a rollup the config no longer has are dropped.
    { name: 'computed', title: "The columns of the resources' rollup and formula fields, and the triggers that keep the rollups", sql: () => computedMigration(project.db, project.models) },
    ...(project.readOnlyQueries
      ? [{ name: 'query', title: "The role the assistant's read-only queries run as, which reads only the resources' tables", sql: () => queryRunnerMigration(project.db, project.models, project.authTables) }]
      : []),
    ...(comments ? [{ name: 'comments', title: 'The comments table of the resources with comments', sql: () => commentsMigration(project.db) }] : []),
    ...(project.webhooks ? [{ name: 'webhooks', title: 'The webhook subscriptions of webhooks()', sql: () => webhooksMigration(project.db, project.webhooks, project.events) }] : []),
    // A store of the app's own keeps the devices elsewhere: nothing to write.
    ...(project.notifications && !(project.notifications.store && project.notifications.historyStore)
      ? [{ name: 'notifications', title: 'The tables of notifications()', sql: () => notificationsMigration(project.db, project.notifications, project.auth) }]
      : []),
  ]
}
