import type { Db } from '@protobase/query'
import { assistantSettings, authStoreTables, checkCalls, checkChanges, checkChannelSends, checkComments, checkComputed, checkDerived, checkMailFeedbackSchema, mailFeedbackResource, checkNotificationsSchema, checkQueryRunner, checkRealtimeRelay, checkResourcesOutsideAuthStore, checkStatusSchema, checkUnsubscribesSchema, checkUserTablesSchema, checkWebhooksSchema, checkWorkflowsSchema, checkMigrationRecord, configExports, relayed, sqlSends } from '@protobase/server'
import type { BuiltProject } from '../config/build-project'
import { builtRuntimeModel } from '../config/project-modules'
import { protobaseVersion } from '../version/version'
import { checkProjectRelay } from './relay-check'

/**
 * The server's startup checks of the database: the record of its migrations (`checkMigrationRecord`), which holds the
 * auth store and the schema modules, such as the jobs schema, the organization pinned while organizations are off
 * after being on (`pinnedOrganization`), then each feature whose schema the record's model does not hold yet; each throws, with what to write as a migration, while a
 * schema the project's features need is missing or behind. They only read. `serve` runs them before it builds the admin, and
 * `protobase doctor` runs them too, so a change that would not start fails wherever doctor runs.
 */
export const checkStartup = async (project: BuiltProject, db: Db) => {
  const exported = configExports(project.config)
  const models = exported.resources.map((resource) => resource.toModel())
  // Mail feedback's events are captured from its table like the app's own resources' events.
  const captured = project.mailFeedback ? [...models, mailFeedbackResource.toModel()] : models
  await checkMigrationRecord(db, builtRuntimeModel(project), protobaseVersion)
  await project.auth?.pinnedOrganization()
  if (project.auth) await checkResourcesOutsideAuthStore(db, models, project.auth)
  if (project.mailFeedback) await checkMailFeedbackSchema(db)
  await checkChanges(db, captured, project.events)
  await checkComments(db, models)
  await checkDerived(db, models)
  await checkCalls(db, project.calls, project.events)
  await checkComputed(db, models)
  if (assistantSettings(project.options?.assistant, process.env)?.kind === 'built-in') await checkQueryRunner(db, project.auth ? authStoreTables(project.auth) : { tables: [], schemas: [] })
  if (project.webhooks) await checkWebhooksSchema(db, project.webhooks)
  if (project.workflows) await checkWorkflowsSchema(db, project.workflows)
  if (relayed(project.realtime)) await checkRealtimeRelay(db)
  if (sqlSends(project.realtime)) await checkChannelSends(db)
  await checkProjectRelay(db, { ...project, models, views: exported.views.map((view) => view.toModel()) }, process.env)
  if (project.notifications) await checkNotificationsSchema(db, project.notifications, project.auth)
  if (project.status) await checkStatusSchema(db, project.status, project.auth)
  if (project.unsubscribe) await checkUnsubscribesSchema(db)
  if (project.userTables) await checkUserTablesSchema(db)
}
