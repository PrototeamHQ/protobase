import { offlineStepsMigration } from '@protobase/server/internal'
import { authMigrationTitle } from '../../auth/migration-file'
import { authRefusals, lastStepsOf } from './auth-difference'
import type { AuthTarget } from './auth-target'
import { inconsistencies } from './consistency'
import { lintCustomFiles } from './lint-custom'
import { readMigrationFiles } from './migration-files'
import { readSnapshot, snapshotFile } from './snapshot-file'

/**
 * `protobase migration check`, for CI: what keeps the migrations from matching the config, one line each, from the
 * files and the snapshot alone, writing nothing. The snapshot disagreeing with the files, a config change the
 * migrations lack, and a hand-written migration marked additive that is not. None when they match.
 */
export const checkMigrations = async (projectDir: string, dir: string, auth: AuthTarget | undefined) => {
  const snapshot = await readSnapshot(projectDir)
  const files = await readMigrationFiles(dir)
  const found = inconsistencies(snapshot, files)
  const before = snapshot?.model.auth
  const refusals = authRefusals(snapshot, auth)
  if (!snapshot && auth && files.some(({ text }) => text.includes(authMigrationTitle))) {
    found.push(`the project has auth migrations from before ${snapshotFile}: start it with \`protobase auth migration\`, against the database with the project's migrations applied`)
  } else if (refusals.length > 0) {
    found.push(...refusals)
  } else if (auth && offlineStepsMigration(auth.names, before && lastStepsOf(before))) {
    found.push('the config and this version of Protobase need auth store steps the migrations lack: run `protobase migration`')
  }
  return [...found, ...lintCustomFiles(files)]
}
