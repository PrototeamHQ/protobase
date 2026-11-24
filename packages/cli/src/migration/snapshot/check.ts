import { storeModel } from '@protobase/server/internal'
import { authMigrationTitle } from '../../auth/migration-file'
import { authRefusals, organizationRefusals, redescribed, snapshotStore, stepsAfter } from './auth-difference'
import type { AuthTarget } from './auth-target'
import { inconsistencies } from './consistency'
import { lintFiles } from '../older-code/lint-files'
import { moduleChanges } from './module-changes'
import { readMigrationFiles } from './migration-files'
import { readSnapshot, snapshotFile } from './snapshot-file'

// Whether the config turns no module off or on again since the snapshot, which would change the store's model itself.
const unswitched = (snapshot: Parameters<typeof moduleChanges>[0], auth: AuthTarget) => {
  const { off, revived } = moduleChanges(snapshot, auth)
  return off.length === 0 && revived.length === 0
}

/**
 * `protobase migration check`, for CI: what keeps the migrations from matching the config, one line each, from the
 * files and the snapshot alone, writing nothing. The snapshot disagreeing with the files, a config change the
 * migrations lack, and a file that does not say, or says wrongly, how it treats older code (`lintFiles`). None when
 * they match.
 */
export const checkMigrations = async (projectDir: string, dir: string, auth: AuthTarget | undefined) => {
  const snapshot = await readSnapshot(projectDir)
  const files = await readMigrationFiles(dir)
  const found = inconsistencies(snapshot, files)
  const refusals = authRefusals(snapshot, auth)
  if (!snapshot && auth && files.some(({ text }) => text.includes(authMigrationTitle))) {
    found.push(`the project has auth migrations from before ${snapshotFile}: start it with \`protobase migration baseline\`, against the database with the project's migrations applied`)
  } else if (refusals.length > 0) {
    found.push(...refusals)
  } else if (auth && organizationRefusals(snapshot, auth).length > 0) {
    found.push(...organizationRefusals(snapshot, auth))
  } else if (auth && stepsAfter(snapshot, auth)) {
    found.push('the config and this version of Protobase need auth store steps the migrations lack: run `protobase migration`')
  } else if (auth && snapshot?.model.auth && unswitched(snapshot, auth) && redescribed(snapshot.model.auth, storeModel(auth.names, snapshotStore(snapshot)!.lastSteps))) {
    found.push('this version of Protobase describes the auth store otherwise than the migrations record it: run `protobase migration`')
  }
  const changes = moduleChanges(snapshot, auth)
  const switched = [...changes.off.map(({ module }) => `${module} off`), ...changes.revived.map(({ module }) => `${module} on again`)]
  if (refusals.length === 0 && switched.length > 0) found.push(`the config turns ${switched.join(', ')}, which the migrations lack: run \`protobase migration\``)
  return [...found, ...(await lintFiles(files))]
}
