import pg from 'pg'
import { assistantSettings, authStoreTables, configExports } from '@protobase/server'
import { checkStatusOptions } from '@protobase/server/internal'
import { projectAuth } from '../config/build-project'
import type { MergedConfig } from '../config/merge-config'
import { projectJobs, projectNotifications, projectResources, projectWebhooks } from '../config/project-parts'
import { loadSourceConfig } from '../config/source-config'
import { loadNearestEnvFile } from '../dev/env'
import type { Extension } from '../project/extensions'
import { openAppDatabase } from '../project/pg-db'

/**
 * The project in `dir` as `protobase dev` merges it, for what its database needs: protobase.config.ts, with the
 * convention's resources when it names none, after the configs of `extensions` and the configs it extends. `close`
 * ends the pool it opened.
 */
export const loadMigrationProject = async (dir: string, extensions: Extension[] = []) => {
  loadNearestEnvFile(dir)
  return migrationProject(await loadSourceConfig(dir, { command: 'tool', extensions }), process.env.DATABASE_URL)
}

/**
 * A merged project config, for what its database needs: its resources' models, a pool on `url`, its auth, and the
 * features that write migrations. `close` ends the pool.
 */
export const migrationProject = async (config: MergedConfig, url: string | undefined) => {
  if (!url) throw new Error('No database: set DATABASE_URL')
  const database = openAppDatabase(pg, url)
  const [resources, jobs, webhooks, notifications, auth] = await Promise.all([projectResources(config), projectJobs(config), projectWebhooks(config), projectNotifications(config), projectAuth(config, database)])
  return {
    models: configExports(resources).resources.map((source) => source.toModel()),
    db: database.db,
    ...(auth && { auth }),
    ...(config.events && { events: config.events }),
    ...(webhooks && { webhooks }),
    ...(config.realtime && { realtime: config.realtime }),
    ...(notifications && { notifications }),
    ...(config.status && { status: checkStatusOptions(config.status) }),
    jobs,
    // The built-in assistant's read-only queries run as a role of their own, which must not read the auth store.
    readOnlyQueries: assistantSettings(config.assistant, process.env)?.kind === 'built-in',
    authTables: auth ? authStoreTables(auth) : { tables: [], schemas: [] },
    close: async () => {
      await database.db.destroy()
    },
  }
}

export type MigrationProject = Awaited<ReturnType<typeof migrationProject>>
