import { ownedDefinitionsMigration, queryRunnerMigration } from '@protobase/server'
import type { MigrationProject } from './migration-project'

/** What one feature still needs of the database, compared with it, written as a part of the next migration. */
export type MigrationPart = {
  /** Its part of the file name after its number. */
  name: string
  /** What the statements are, the comment above them. */
  title: string
  /** The statements, compared with the database; `undefined` when it is current. */
  sql: () => Promise<string | undefined>
}

/**
 * Every feature the project's config enables but the auth store and the schema modules, which the snapshot holds, in
 * the order their statements are written, after theirs.
 */
export const migrationParts = (project: MigrationProject): MigrationPart[] => {
  return [
    ...(project.readOnlyQueries
      ? [{ name: 'query', title: "The role the assistant's read-only queries run as, which reads only the resources' tables", sql: () => queryRunnerMigration(project.db, project.models, project.authTables) }]
      : []),
    // Run after the deploy that brought the code of an ejected table, so its definition goes in a later deploy.
    ...(project.userTables ? [{ name: 'owned_definitions', title: 'The delete of the definitions of user tables that resources in code own now', sql: () => ownedDefinitionsMigration(project.db, project.models) }] : []),
  ]
}
