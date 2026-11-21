import type { Db } from '@protobase/query'
import { assistantSettings, authStoreTables, checkAuthSchema, checkCalls, checkChanges, checkChannelSends, checkComments, checkComputed, checkDerived, checkNotificationsSchema, checkQueryRunner, checkRealtimeRelay, checkRelaySchema, checkResourcesOutsideAuthStore, checkStatusSchema, checkUnsubscribesSchema, checkUserTablesSchema, checkWebhooksSchema, checkWorkflowsSchema, configExports, relayed, sqlSends } from '@protobase/server'
import type { BuiltProject } from '../config/build-project'

/**
 * The server's startup checks of the database: each throws, with what to write as a migration, while a schema the
 * project's features need is missing or behind. They only read. `serve` runs them before it builds the admin, and
 * `protobase doctor` runs them too, so a change that would not start fails wherever doctor runs.
 */
export const checkStartup = async (project: BuiltProject, db: Db) => {
  const models = configExports(project.config).resources.map((resource) => resource.toModel())
  if (project.auth) await checkAuthSchema(project.auth)
  if (project.auth) await checkResourcesOutsideAuthStore(db, models, project.auth)
  await checkChanges(db, models, project.events)
  await checkComments(db, models)
  await checkDerived(db, models)
  await checkCalls(db, project.calls, project.events)
  await checkComputed(db, models)
  if (assistantSettings(project.options?.assistant, process.env)?.kind === 'built-in') await checkQueryRunner(db, project.auth ? authStoreTables(project.auth) : { tables: [], schemas: [] })
  if (project.webhooks) await checkWebhooksSchema(db, project.webhooks)
  if (project.workflows) await checkWorkflowsSchema(db, project.workflows)
  if (relayed(project.realtime)) await checkRealtimeRelay(db)
  if (sqlSends(project.realtime)) await checkChannelSends(db)
  if (project.realtime?.relay) await checkRelaySchema(db, project.auth)
  if (project.notifications) await checkNotificationsSchema(db, project.notifications, project.auth)
  if (project.status) await checkStatusSchema(db, project.status, project.auth)
  if (project.unsubscribe) await checkUnsubscribesSchema(db)
  if (project.userTables) await checkUserTablesSchema(db)
}
