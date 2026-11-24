import { authSchemaMigration } from '@protobase/server'
import { authMigrationTitle } from '../../auth/migration-file'
import type { MigrationProject } from '../migration-project'
import { migrationParts } from '../parts'

/** What one feature of the config still needs of the database for this release: statements, under a title. */
export type ReleaseStep = { name: string; title: string; sql: string }

/**
 * What this release of Protobase still needs of the project's database for every feature its config turns on, compared
 * with the database itself: the auth store by the steps its `auth_steps` table records, the other parts by their schemas, as
 * `protobase migration` compares them. In the order they apply; none when the database is current.
 */
export const releaseSteps = async (project: MigrationProject) => {
  const auth = project.auth && (await authSchemaMigration(project.auth))
  const steps: ReleaseStep[] = auth ? [{ name: 'auth', title: authMigrationTitle, sql: auth }] : []
  for (const part of migrationParts(project)) {
    const sql = await part.sql({ authWritten: Boolean(auth) })
    if (sql !== undefined) steps.push({ name: part.name, title: part.title, sql })
  }
  return steps
}
