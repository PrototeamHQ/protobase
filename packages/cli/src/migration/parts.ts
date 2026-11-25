import { commentsMigration, computedMigration, derivedMigration, mailFeedbackMigration, mailFeedbackResource, ownedDefinitionsMigration, queryRunnerMigration, unsubscribesMigration, userTablesMigration } from '@protobase/server'
import type { MigrationProject } from './migration-project'

/** What one feature still needs of the database, compared with it, written as a part of the next migration. */
export type MigrationPart = {
  /** Its part of the file name after its number. */
  name: string
  /** What the statements are, the comment above them. */
  title: string
  /** The statements, compared with the database; `undefined` when it is current. */
  sql: () => Promise<string | undefined>
  /** Whether it goes before the schema modules' statements: it makes a table their triggers go on. */
  beforeModules?: boolean
}

/**
 * Every feature the project's config enables but the auth store and the schema modules, which the snapshot holds, in
 * the order their statements are written, after theirs.
 */
export const migrationParts = (project: MigrationProject): MigrationPart[] => {
  const comments = project.models.some((model) => model.comments)
  return [
    // Mail feedback's events are captured from its table, which goes before the change capture's triggers on it.
    ...(project.mailFeedback ? [{ name: 'mail_feedback', title: 'The table of the bounces and complaints of the mail the app sends', sql: () => mailFeedbackMigration(project.db), beforeModules: true }] : []),
    // Always compared, so that the function and trigger of a rollup the config no longer has are dropped.
    { name: 'computed', title: "The columns of the resources' rollup and formula fields, the triggers that keep the rollups, and the tables and refresh functions of their time rollups", sql: () => computedMigration(project.db, project.models) },
    ...(project.readOnlyQueries
      ? [{ name: 'query', title: "The role the assistant's read-only queries run as, which reads only the resources' tables", sql: () => queryRunnerMigration(project.db, project.models, project.authTables) }]
      : []),
    // After the jobs schema: a newly declared derived value enqueues the job that computes its records once. Always
    // compared, so that the state of a derived value the config no longer has is dropped.
    { name: 'derived', title: "The state of the resources' derived values and what they read", sql: () => derivedMigration(project.db, project.models) },
    ...(comments ? [{ name: 'comments', title: 'The comments table of the resources with comments', sql: () => commentsMigration(project.db) }] : []),
    ...(project.unsubscribe ? [{ name: 'unsubscribes', title: 'The table of who unsubscribed from which topic of the bulk mail', sql: () => unsubscribesMigration(project.db) }] : []),
    ...(project.userTables ? [{ name: 'user_tables', title: 'The schemas of the tables users add and of their definitions, and pg_trgm', sql: () => userTablesMigration(project.db) }] : []),
    // Run after the deploy that brought the code of an ejected table, so its definition goes in a later deploy.
    ...(project.userTables ? [{ name: 'owned_definitions', title: 'The delete of the definitions of user tables that resources in code own now', sql: () => ownedDefinitionsMigration(project.db, project.models) }] : []),
  ]
}
