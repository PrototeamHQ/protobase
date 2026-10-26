import path from 'node:path'
import postgres from 'postgres'
import { readManifest } from '../bundle/manifest'
import { applyMigrations } from '../migration/apply-migrations'
import { bundleConfigFile } from '../worker/start-worker'
import { checkBundleManifest } from './bundle-manifest'

/**
 * The runtime's `migrate`: applies the migrations the bundle carries to DATABASE_URL (see applyMigrations). It never
 * imports the config module, so it runs no code of the app and needs none of its settings. On a failure the error
 * ends the process, which closes the connection.
 */
export const migrateBundle = async (bundle: string, env: Record<string, string | undefined>, out: (text: string) => void) => {
  const file = await bundleConfigFile(bundle)
  checkBundleManifest(file)
  const dir = path.dirname(file)
  const manifest = await readManifest(dir)
  if (!manifest.migrations) {
    out('the bundle has no migrations\n')
    return
  }
  if (!env.DATABASE_URL) throw new Error('No database: set DATABASE_URL')
  // Its own connection: the pool of db/connect.ts opens read-only sessions.
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} })
  await applyMigrations(sql, path.join(dir, manifest.migrations), out)
  await sql.end()
}
