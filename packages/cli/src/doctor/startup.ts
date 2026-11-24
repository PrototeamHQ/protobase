import { randomBytes } from 'node:crypto'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { readOrigins, readPasskeyDomain } from '@protobase/server/internal'
import { buildProject, type AppDatabase } from '../config/build-project'
import type { MergedConfig } from '../config/merge-config'
import { projectAdmin } from '../project/project-admin'
import { servedAdmin } from '../project/served-admin'
import { checkStartup } from '../serve/startup-checks'

/**
 * The app's URL, or a stand-in that sign-in accepts: on the passkey domain when the config or `PROTOBASE_PASSKEY_DOMAIN`
 * names one, since it must be the host of one of the app's origins, and on localhost otherwise; with the scheme of the
 * app's other origins (`auth.origins` or `PROTOBASE_ORIGINS`), which must share the URL's, and https or http without them.
 */
export const startupUrl = (config: Pick<MergedConfig, 'url' | 'auth'>, env: Record<string, string | undefined>) => {
  if (config.url) return config.url
  const auth = config.auth || {}
  const passkeyDomain = auth.passkeyDomain ?? readPasskeyDomain(env)
  const origin = (auth.origins ?? readOrigins(env))[0]
  const scheme = origin ? new URL(origin).protocol : passkeyDomain ? 'https:' : 'http:'
  return `${scheme}//${passkeyDomain ?? 'localhost'}`
}

// Sign-in is built only to read its store, so without the app's URL and secret it gets stand-ins for them.
const startupConfig = (config: MergedConfig) => ({ ...config, url: startupUrl(config, process.env), secret: config.secret ?? randomBytes(32).toString('base64') })

// A pool connects only for a query, and building the app makes none: one that reached for this address would fail.
const noDatabase = 'postgres://nobody@127.0.0.1:1/none'

/**
 * Builds the app and its admin from its config as `serve` does, over a pool that never connects: the server's startup
 * refusals the config alone decides, such as an owner field that must hold sign-in's user ids, with the server's own
 * message. What `checkServerStartup` checks of the database is left out.
 */
export const checkServerBuild = async (config: MergedConfig) => {
  const pool = new pg.Pool({ connectionString: noDatabase })
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) })
  const build = async () => {
    const project = await buildProject(startupConfig(config), { db })
    await projectAdmin(project, db).admin.stopHolding()
  }
  await build().finally(() => db.destroy())
}

/**
 * Builds the app from its config over `database` as `serve` does and runs the server's startup checks of the database,
 * the jobs schema with the record of migrations, so doctor refuses what the server would refuse to start on, with the server's own message.
 * The environment's settings, such as the assistant's key, are the running app's and are not checked here; sign-in is
 * built only to read its store, so without the app's URL and secret it gets stand-ins for them (`startupUrl`).
 * It checks the app as `serve` runs it, from protobase.config.ts and the convention's config folder, whatever folder
 * doctor's own checks read.
 */
export const checkServerStartup = async (config: MergedConfig, database: AppDatabase) => {
  const project = await buildProject(startupConfig(config), database)
  await checkStartup(project, database.db)
  const { admin } = await servedAdmin(project, database.db)
  await admin.stopHolding()
}
