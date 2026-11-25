import { baselineStore, stepRecordMigration, storeModel, targetIds, type ModuleTargets } from '@protobase/server/internal'
import { organizationsNow, type AuthTarget } from '../snapshot/auth-target'
import { refuseInconsistent } from '../snapshot/consistency'
import { readMigrationFiles } from '../snapshot/migration-files'
import { readSnapshot, snapshotFile } from '../snapshot/snapshot-file'
import { writeMigrationFile } from '../snapshot/write-file'
import { describedModules, readLiveModules } from './read-live-modules'
import { readLiveStore } from './read-live-store'

export type Baseline = {
  projectDir: string
  dir: string
  /** The config's auth store; `undefined` with sign-in off. */
  auth: AuthTarget | undefined
  /** The schema modules the config needs (`neededModules`). */
  modules: ModuleTargets
  /** The database with the project's migrations applied. */
  url: string
  protobaseVersion: string
  newId: () => string
}

const intro = `-- Written by \`protobase migration baseline\` from the database: the auth store as the project's earlier migrations made it.
-- It drops nothing, and changes nothing but the record of the store's steps, made from auth_migrations where the store
-- has none; it starts ${snapshotFile}, and \`protobase migration\` writes what the store lacks from it.
`

const modulesIntro = `-- Written by \`protobase migration baseline\` from the database: the schema modules the project's earlier migrations
-- made, which ${snapshotFile} did not record. It changes nothing; \`protobase migration\` writes what they lack from it.
`

/**
 * `protobase migration baseline`: describes, as the database has them, the auth store of a project without a snapshot
 * and each schema module the config needs that the snapshot lacks, such as one an earlier version's migration made,
 * in a numbered migration that only records itself, and the store's steps where it records them by version alone,
 * and the snapshot that ends at it, once. Each module of the store that is on is at the step `auth_migrations` records,
 * a module that is off but has tables is kept, organizations count as ever on when a table whose rows belong to one has
 * the column that names it, and a user table another system made is external. A schema module is at the step its
 * catalogue shows (`SchemaModule.read`). Returns the file's path.
 */
export const writeBaseline = async ({ projectDir, dir, auth, modules, url, protobaseVersion, newId }: Baseline) => {
  const snapshot = await readSnapshot(projectDir)
  refuseInconsistent(snapshot, await readMigrationFiles(dir))
  const live = await readLiveModules(url, Object.fromEntries(targetIds(modules).filter((id) => !snapshot?.model.modules?.[id]).map((id) => [id, modules[id]])))
  const found = Object.keys(live).length > 0
  const described = describedModules(live).join('\n')
  if (snapshot) {
    if (!found) throw new Error(`The project has ${snapshotFile} already, and it records every schema module the database has: \`protobase migration\` goes on from it`)
    const draft = { previous: snapshot, auth: snapshot.model.auth, modules: { ...snapshot.model.modules, ...live }, organizations: organizationsNow(auth), protobaseVersion }
    return writeMigrationFile(projectDir, dir, { name: 'baseline', body: `${modulesIntro}${described}\n`, additive: true }, draft, newId())
  }
  if (!auth && !found) throw new Error("Sign-in is off in the project's config, and the database has none of the schema modules it needs: there is nothing to describe, and `protobase migration` writes them")
  const store = auth && baselineStore(auth.names, await readLiveStore(url, auth.names))
  const modulesText = found ? `${described}\n` : ''
  const body = !store ? `${modulesIntro}${modulesText}` : store.stepRecord ? `${intro}${modulesText}` : `${intro}${modulesText}\n${stepRecordMigration(auth.names)}\n`
  const decisions = { modules: { kept: store?.kept ?? [], archived: [] }, organizations: { everOn: store?.organizationsEverOn ?? false, defaultOrganization: null }, external: store?.external ?? [] }
  const draft = { previous: undefined, auth: store ? storeModel(auth.names, store.lastSteps) : undefined, modules: found ? live : undefined, organizations: organizationsNow(auth), protobaseVersion, decisions }
  return writeMigrationFile(projectDir, dir, { name: 'baseline', body, additive: true }, draft, newId())
}
