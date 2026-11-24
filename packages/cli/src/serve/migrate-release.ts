import path from 'node:path'
import postgres from 'postgres'
import { readManifest } from '../bundle/manifest'
import { migrationProject } from '../migration/migration-project'
import { pendingIn } from '../migration/plan-migrations'
import { applyReleaseSteps, planReleaseSteps, type FindSteps } from '../migration/release/apply-release-steps'
import { releaseSteps } from '../migration/release/release-steps'
import { bundleConfigFile } from '../worker/start-worker'
import { checkBundleManifest } from './bundle-manifest'
import { loadBundle } from './load-bundle'

/**
 * The runtime's `migrate-release`: brings DATABASE_URL to this release's own schema steps for every feature the
 * bundle's config turns on (see releaseSteps), applied in one transaction, or with `plan` printed as SQL and applied
 * not at all. It writes no file: the steps come from the database and this release. The bundle's own migrations go
 * first, since the steps are compared with the database they made. On a failure the error ends the process.
 */
export const migrateRelease = async (bundle: string, env: Record<string, string | undefined>, out: (text: string) => void, plan: boolean) => {
  const file = await bundleConfigFile(bundle)
  checkBundleManifest(file)
  const dir = path.dirname(file)
  if (!env.DATABASE_URL) throw new Error('No database: set DATABASE_URL')
  // Its own connection: the pool of db/connect.ts opens read-only sessions.
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} })
  const { migrations } = await readManifest(dir)
  const project = await migrationProject(await loadBundle(file), env.DATABASE_URL)
  // Under the lock when applying: the bundle's migrations checked, then the steps compared, with what is committed then.
  const find: FindSteps = async (tx) => {
    const pending = migrations ? await pendingIn(tx, path.join(dir, migrations)) : []
    if (pending.length > 0) throw new Error(`The database lacks the bundle's migrations ${pending.join(', ')}: apply them first with \`protobase-serve migrate\``)
    return releaseSteps(project)
  }
  await (plan ? planReleaseSteps(sql, find, out) : applyReleaseSteps(sql, find, out))
  await project.close()
  await sql.end()
}
