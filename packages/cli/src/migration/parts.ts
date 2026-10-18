import { authSchemaMigration, changesMigration, commentsMigration, isCaptured, jobsSchemaMigration, webhooksMigration } from '@protobase/server'
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
    ...(project.auth ? [{ name: 'auth', title: 'The auth schema changes this version of Protobase needs', sql: () => authSchemaMigration(project.auth!) }] : []),
    // Events and history are captured with a dispatch job, events delivered, mentions mailed and AI fields filled by jobs,
    // whose waiting and failed ones webhooks() lists.
    ...(project.jobs.length > 0 || project.models.some(isCaptured) || comments || aiFields || project.webhooks ? [{ name: 'jobs', title: 'The jobs schema this version of Protobase needs', sql: () => jobsSchemaMigration(project.db) }] : []),
    { name: 'changes', title: "The change capture the resources' events and history need", sql: () => changesMigration(project.db, project.models, project.events) },
    ...(comments ? [{ name: 'comments', title: 'The comments table of the resources with comments', sql: () => commentsMigration(project.db) }] : []),
    ...(project.webhooks ? [{ name: 'webhooks', title: 'The webhook subscriptions of webhooks()', sql: () => webhooksMigration(project.db, project.webhooks, project.events) }] : []),
  ]
}
