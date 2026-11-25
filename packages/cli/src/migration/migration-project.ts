import pg from 'pg'
import { configExports, neededModules } from '@protobase/server'
import { checkStatusOptions, storeNames } from '@protobase/server/internal'
import { projectAuth } from '../config/build-project'
import type { MergedConfig } from '../config/merge-config'
import { projectJobs, projectNotifications, projectResources, projectWebhooks } from '../config/project-parts'
import { mailFeedbackOn } from '../config/mail-feedback-config'
import { readOnlyQueriesOn } from '../config/read-only-queries'
import { unsubscribeOn } from '../config/unsubscribe-config'
import { userTablesOn } from '../config/user-tables-config'
import { openAppDatabase } from '../project/pg-db'

/**
 * A merged project config, for what its database needs: its resources' models, a pool on `url`, its auth, the schema
 * modules it needs, and the features that write migrations. `close` ends the pool.
 */
export const migrationProject = async (config: MergedConfig, url: string | undefined) => {
  if (!url) throw new Error('No database: set DATABASE_URL')
  const database = openAppDatabase(pg, url)
  const [resources, jobs, webhooks, notifications, auth] = await Promise.all([projectResources(config), projectJobs(config), projectWebhooks(config), projectNotifications(config), projectAuth(config, database)])
  const exported = configExports(resources)
  const models = exported.resources.map((source) => source.toModel())
  const views = exported.views.map((source) => source.toModel())
  const app = { models, views, jobs, signIn: Boolean(auth), ...(auth && { authStore: storeNames(auth) }), mailFeedback: mailFeedbackOn(config), unsubscribe: unsubscribeOn(config), webhooks, workflows: config.workflows, notifications, ...(config.status && { status: checkStatusOptions(config.status) }), calls: config.calls, realtime: config.realtime, events: config.events, userTables: userTablesOn(config), readOnlyQueries: readOnlyQueriesOn(config.assistant, process.env) }
  return {
    models,
    views,
    /** The schema modules the config needs (`neededModules`). */
    modules: neededModules(app),
    db: database.db,
    ...(auth && { auth }),
    ...(config.events && { events: config.events }),
    ...(webhooks && { webhooks }),
    ...(config.workflows && { workflows: config.workflows }),
    ...(config.realtime && { realtime: config.realtime }),
    ...(notifications && { notifications }),
    jobs,
    userTables: userTablesOn(config),
    close: async () => {
      await database.db.destroy()
    },
  }
}

export type MigrationProject = Awaited<ReturnType<typeof migrationProject>>
