import type { Db } from '@protobase/query'
import { authStoreTables, checkQueryRoleSafety, checkResourcesOutsideAuthStore, checkMigrationRecord, configExports } from '@protobase/server'
import type { BuiltProject } from '../config/build-project'
import { builtRuntimeModel } from '../config/project-modules'
import { readOnlyQueriesOn } from '../config/read-only-queries'
import { protobaseVersion } from '../version/version'
import { checkProjectRelay } from './relay-check'

/**
 * The server's startup checks of the database: the record of its migrations (`checkMigrationRecord`), which holds the
 * auth store and the schema modules, such as the jobs schema, the rollups and formulas, the change capture, the derived schema, the schemas of user tables, webhooks, workflows, status, calls, the relay, comments, mail feedback, unsubscribe and the assistant's query role, the organization pinned while organizations are off
 * after being on (`pinnedOrganization`), the resources over the auth store's tables, and what the live database gave the
 * query role (`checkQueryRoleSafety`); each throws, with what to write as a migration, while a schema the project's
 * features need is missing or behind. They only read. `serve` runs them before it builds the admin, and
 * `protobase doctor` runs them too, so a change that would not start fails wherever doctor runs.
 */
export const checkStartup = async (project: BuiltProject, db: Db) => {
  const exported = configExports(project.config)
  const models = exported.resources.map((resource) => resource.toModel())
  await checkMigrationRecord(db, builtRuntimeModel(project), protobaseVersion)
  await project.auth?.pinnedOrganization()
  if (project.auth) await checkResourcesOutsideAuthStore(db, models, project.auth)
  if (readOnlyQueriesOn(project.options?.assistant, process.env)) await checkQueryRoleSafety(db, project.auth ? authStoreTables(project.auth) : { tables: [], schemas: [] })
  checkProjectRelay({ ...project, models, views: exported.views.map((view) => view.toModel()) }, process.env)
}
