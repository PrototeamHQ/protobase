import { randomBytes } from 'node:crypto'
import { checkJobsSchema } from '@protobase/server'
import { buildProject, type AppDatabase } from '../config/build-project'
import type { MergedConfig } from '../config/merge-config'
import { servedAdmin } from '../project/served-admin'
import { checkStartup } from '../serve/startup-checks'

/** The app's URL, or a stand-in on the passkey domain the config names, which must be the host of one of its origins. */
export const startupUrl = (config: Pick<MergedConfig, 'url' | 'auth'>) => {
  if (config.url) return config.url
  const passkeyDomain = config.auth ? config.auth.passkeyDomain : undefined
  return passkeyDomain ? `https://${passkeyDomain}` : 'http://localhost'
}

/**
 * Builds the app from its config over `database` as `serve` does and runs the server's startup checks of the database,
 * its jobs schema included, so doctor refuses what the server would refuse to start on, with the server's own message.
 * The environment's settings, such as the assistant's key, are the running app's and are not checked here; sign-in is
 * built only to read its store, so without the app's URL and secret it gets stand-ins for them (`startupUrl`).
 * It checks the app as `serve` runs it, from protobase.config.ts and the convention's config folder, whatever folder
 * doctor's own checks read.
 */
export const checkServerStartup = async (config: MergedConfig, database: AppDatabase) => {
  const readOnly = { ...config, url: startupUrl(config), secret: config.secret ?? randomBytes(32).toString('base64') }
  const project = await buildProject(readOnly, database)
  await checkStartup(project, database.db)
  const { admin, jobs } = await servedAdmin(project, database.db)
  await admin.stopHolding()
  if (jobs.length > 0) await checkJobsSchema(database.db)
}
