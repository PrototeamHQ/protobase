import { authSchemaMigration } from '@protobase/server'
import { moduleDifference, schemaModules, targetIds } from '@protobase/server/internal'
import { authMigrationTitle } from '../../auth/migration-file'
import type { MigrationProject } from '../migration-project'
import { migrationParts } from '../parts'

/**
 * What one feature of the config still needs of the database for this release: statements, under a title. `breaks`:
 * what of a schema module's statements the code before does not run on, which keeps the release from being additive.
 */
export type ReleaseStep = { name: string; title: string; sql: string; breaks?: string[] }

/**
 * What this release of Protobase still needs of the project's database for every feature its config turns on, compared
 * with the database itself: the auth store by the steps its `auth_steps` table records, each schema module by what its
 * catalogue shows (`SchemaModule.read`), the other parts by their schemas, as `protobase migration` compares them. In
 * the order they apply; none when the database is current.
 */
export const releaseSteps = async (project: MigrationProject) => {
  const auth = project.auth && (await authSchemaMigration(project.auth))
  const steps: ReleaseStep[] = auth ? [{ name: 'auth', title: authMigrationTitle, sql: auth }] : []
  const parts: (ReleaseStep & { beforeModules?: boolean })[] = []
  for (const part of migrationParts(project)) {
    const sql = await part.sql()
    if (sql !== undefined) parts.push({ name: part.name, title: part.title, sql, ...(part.beforeModules && { beforeModules: true }) })
  }
  const modules: ReleaseStep[] = []
  for (const id of targetIds(project.modules)) {
    const input = project.modules[id]!
    const { sql, breaks } = moduleDifference(schemaModules[id], input, await schemaModules[id].read(project.db, input))
    if (sql !== undefined) modules.push({ name: id, title: schemaModules[id].title, sql, breaks })
  }
  // In the order `protobase migration` writes them: the parts that make tables the modules' triggers go on first.
  const step = ({ beforeModules: _, ...rest }: (typeof parts)[number]): ReleaseStep => rest
  return [...steps, ...parts.filter(({ beforeModules }) => beforeModules).map(step), ...modules, ...parts.filter(({ beforeModules }) => !beforeModules).map(step)]
}
