import { randomBytes } from 'node:crypto'
import { checkJobsSchema } from '@protobase/server'
import { buildProject, type AppDatabase } from '../config/build-project'
import type { MergedConfig } from '../config/merge-config'
import { servedAdmin } from '../project/served-admin'
import { checkStartup } from '../serve/startup-checks'

/**
 * Builds the app from its config over `database` as `serve` does and runs the server's startup checks of the database,
 * its jobs schema included, so doctor refuses what the server would refuse to start on, with the server's own message.
 * The environment's settings, such as the assistant's key, are the running app's and are not checked here; sign-in is
 * built only to read its store, so without the app's URL and secret it gets stand-ins for them.
 */
export const checkServerStartup = async (config: MergedConfig, database: AppDatabase) => {
  const readOnly = { ...config, url: config.url ?? 'http://localhost', secret: config.secret ?? randomBytes(32).toString('base64') }
  const project = await buildProject(readOnly, database)
  await checkStartup(project, database.db)
  const { admin, jobs } = await servedAdmin(project, database.db)
  await admin.stopHolding()
  if (jobs.length > 0) await checkJobsSchema(database.db)
}
