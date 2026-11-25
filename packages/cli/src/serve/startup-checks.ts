import type { Db } from '@protobase/query'
import { assistantSettings, authStoreTables, checkComments, checkComputed, checkDerived, checkMailFeedbackSchema, checkQueryRunner, checkResourcesOutsideAuthStore, checkUnsubscribesSchema, checkUserTablesSchema, checkMigrationRecord, configExports } from '@protobase/server'
import type { BuiltProject } from '../config/build-project'
import { builtRuntimeModel } from '../config/project-modules'
import { protobaseVersion } from '../version/version'
import { checkProjectRelay } from './relay-check'

/**
 * The server's startup checks of the database: the record of its migrations (`checkMigrationRecord`), which holds the
 * auth store and the schema modules, such as the jobs schema, the change capture, webhooks, workflows, status, calls and the relay, the organization pinned while organizations are off
 * after being on (`pinnedOrganization`), then each feature whose schema the record's model does not hold yet; each throws, with what to write as a migration, while a
 * schema the project's features need is missing or behind. They only read. `serve` runs them before it builds the admin, and
 * `protobase doctor` runs them too, so a change that would not start fails wherever doctor runs.
 */
export const checkStartup = async (project: BuiltProject, db: Db) => {
  const exported = configExports(project.config)
  const models = exported.resources.map((resource) => resource.toModel())
  await checkMigrationRecord(db, builtRuntimeModel(project), protobaseVersion)
  await project.auth?.pinnedOrganization()
  if (project.auth) await checkResourcesOutsideAuthStore(db, models, project.auth)
  if (project.mailFeedback) await checkMailFeedbackSchema(db)
  await checkComments(db, models)
  await checkDerived(db, models)
  await checkComputed(db, models)
  if (assistantSettings(project.options?.assistant, process.env)?.kind === 'built-in') await checkQueryRunner(db, project.auth ? authStoreTables(project.auth) : { tables: [], schemas: [] })
  checkProjectRelay({ ...project, models, views: exported.views.map((view) => view.toModel()) }, process.env)
  if (project.unsubscribe) await checkUnsubscribesSchema(db)
  if (project.userTables) await checkUserTablesSchema(db)
}
