import pg from 'pg'
import { assistantSettings, authStoreTables, configExports } from '@protobase/server'
import { checkStatusOptions } from '@protobase/server/internal'
import { projectAuth } from '../config/build-project'
import type { MergedConfig } from '../config/merge-config'
import { projectJobs, projectNotifications, projectResources, projectWebhooks } from '../config/project-parts'
import { loadSourceConfig } from '../config/source-config'
import { withDevUrl } from '../config/tool-url'
import { mailFeedbackOn } from '../config/mail-feedback-config'
import { unsubscribeOn } from '../config/unsubscribe-config'
import { userTablesOn } from '../config/user-tables-config'
import { loadNearestEnvFile } from '../dev/env'
import type { Extension } from '../project/extensions'
import { openAppDatabase } from '../project/pg-db'

/**
 * The config of the project in `dir` as `protobase dev` merges it: protobase.config.ts, with the convention's resources
 * when it names none, after the configs of `extensions` and the configs it extends, with the `.env` nearest it read,
 * and the project's dev address when it sets no `url` (`withDevUrl`).
 */
export const loadMigrationConfig = async (dir: string, extensions: Extension[] = []) => {
  loadNearestEnvFile(dir)
  return withDevUrl(await loadSourceConfig(dir, { command: 'tool', extensions }), dir)
}

/**
 * A merged project config, for what its database needs: its resources' models, a pool on `url`, its auth, and the
 * features that write migrations. `close` ends the pool.
 */
export const migrationProject = async (config: MergedConfig, url: string | undefined) => {
  if (!url) throw new Error('No database: set DATABASE_URL')
  const database = openAppDatabase(pg, url)
  const [resources, jobs, webhooks, notifications, auth] = await Promise.all([projectResources(config), projectJobs(config), projectWebhooks(config), projectNotifications(config), projectAuth(config, database)])
  const exported = configExports(resources)
  return {
    models: exported.resources.map((source) => source.toModel()),
    views: exported.views.map((source) => source.toModel()),
    db: database.db,
    ...(auth && { auth }),
    ...(config.events && { events: config.events }),
    ...(webhooks && { webhooks }),
    ...(config.workflows && { workflows: config.workflows }),
    ...(config.realtime && { realtime: config.realtime }),
    ...(config.calls && { calls: config.calls }),
    ...(notifications && { notifications }),
    ...(config.status && { status: checkStatusOptions(config.status) }),
    jobs,
    userTables: userTablesOn(config),
    unsubscribe: unsubscribeOn(config),
    mailFeedback: mailFeedbackOn(config),
    // The built-in assistant's read-only queries run as a role of their own, which must not read the auth store.
    readOnlyQueries: assistantSettings(config.assistant, process.env)?.kind === 'built-in',
    authTables: auth ? authStoreTables(auth) : { tables: [], schemas: [] },
    close: async () => {
      await database.db.destroy()
    },
  }
}

export type MigrationProject = Awaited<ReturnType<typeof migrationProject>>
