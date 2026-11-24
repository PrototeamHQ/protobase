import { baselineStore, stepRecordMigration, storeModel } from '@protobase/server/internal'
import { organizationsNow, type AuthTarget } from '../snapshot/auth-target'
import { refuseInconsistent } from '../snapshot/consistency'
import { readMigrationFiles } from '../snapshot/migration-files'
import { readSnapshot, snapshotFile } from '../snapshot/snapshot-file'
import { writeMigrationFile } from '../snapshot/write-file'
import { readLiveStore } from './read-live-store'

export type Baseline = {
  projectDir: string
  dir: string
  auth: AuthTarget
  /** The database with the project's migrations applied. */
  url: string
  protobaseVersion: string
  newId: () => string
}

const intro = `-- Written by \`protobase migration baseline\` from the database: the auth store as the project's earlier migrations made it.
-- It drops nothing, and changes nothing but the record of the store's steps, made from auth_migrations where the store
-- has none; it starts ${snapshotFile}, and \`protobase migration\` writes what the store lacks from it.
`

/**
 * `protobase migration baseline`: describes the auth store of a project without a snapshot, as its database has it,
 * in a numbered migration that only records itself, and the store's steps where it records them by version alone,
 * and the snapshot that ends at it, once. Each module that is on is
 * at the step `auth_migrations` records, a module that is off but has tables is kept, organizations count as ever on
 * when a table whose rows belong to one has the column that names it, and a user table another system made is
 * external. Returns the file's path.
 */
export const writeBaseline = async ({ projectDir, dir, auth, url, protobaseVersion, newId }: Baseline) => {
  if (await readSnapshot(projectDir)) throw new Error(`The project has ${snapshotFile} already: a baseline only starts it, and \`protobase migration\` goes on from it`)
  refuseInconsistent(undefined, await readMigrationFiles(dir))
  const store = baselineStore(auth.names, await readLiveStore(url, auth.names))
  const body = store.stepRecord ? intro : `${intro}\n${stepRecordMigration(auth.names)}\n`
  const decisions = { modules: { kept: store.kept, archived: [] }, organizations: { everOn: store.organizationsEverOn, defaultOrganization: null }, external: store.external }
  const draft = { previous: undefined, auth: storeModel(auth.names, store.lastSteps), organizations: organizationsNow(auth), protobaseVersion, decisions }
  return writeMigrationFile(projectDir, dir, { name: 'baseline', body, additive: true }, draft, newId())
}
