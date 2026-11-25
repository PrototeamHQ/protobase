import { rm } from 'node:fs/promises'
import path from 'node:path'
import { contractMark, storeNamesList, type LastSteps, type StoreModel } from '@protobase/server/internal'
import { afterFileOf } from '../record/after-file'
import { refuseInconsistent } from './consistency'
import { protobaseFiles, readMigrationFiles } from './migration-files'
import { modelHash, readSnapshot, removeSnapshot, snapshotFile, writeSnapshot, type Snapshot } from './snapshot-file'

// The model a snapshot had at an earlier migration: the current one's names, with each module at the step that
// migration's header records. Exact while the migrations between changed nothing but steps, which its model hash proves.
const atSteps = (model: StoreModel | undefined, steps: LastSteps): StoreModel | undefined => {
  if (!model || Object.keys(steps).length === 0) return
  const modules = Object.entries(model.modules).filter(([module]) => steps[module as keyof LastSteps] !== undefined)
  return { ...model, modules: Object.fromEntries(modules.map(([module, entry]) => [module, { ...entry!, lastStep: steps[module as keyof LastSteps]! }])) }
}

/**
 * `protobase migration drop`: deletes the newest migration Protobase wrote and takes the snapshot back to the one
 * before it, or removes the snapshot when it was the first. Refuses while the snapshot disagrees with the files, so it
 * never deletes another branch's migration, and when the snapshot before cannot be rebuilt exactly, as after a
 * hand-written migration that recorded the config. Returns the file it deleted.
 */
export const dropMigration = async (projectDir: string, dir: string) => {
  const snapshot = await readSnapshot(projectDir)
  if (!snapshot) throw new Error(`The project has no ${snapshotFile}: no migration of Protobase's to drop`)
  const files = await readMigrationFiles(dir)
  refuseInconsistent(snapshot, files)
  const written = protobaseFiles(files)
  const newest = written.at(-1)!
  const previous = written.at(-2)
  // A sign-off or delete changes what the snapshot decided, which its lines do not record.
  if (newest.text.includes(contractMark(''))) {
    throw new Error(`${newest.file} signs off or deletes what an earlier migration retired, which changes ${snapshotFile}'s decisions: delete it by hand and take ${snapshotFile} from before it from version control`)
  }
  // The migration with its `.after.sql`, when it has one.
  const remove = async () => {
    await rm(path.join(dir, newest.file))
    await rm(path.join(dir, afterFileOf(newest.file)), { force: true })
  }
  if (!previous) {
    await remove()
    await removeSnapshot(projectDir)
    return newest.file
  }
  const auth = atSteps(snapshot.model.auth, previous.header.steps)
  const modules = previous.header.modules
  const model = { ...(auth && { auth }), ...(modules && { modules }) }
  if (modelHash(model) !== previous.header.model) {
    throw new Error(`${newest.file} changed more than the steps, so the snapshot before it cannot be rebuilt: delete it by hand and take ${snapshotFile} from before it from version control`)
  }
  const rebuilt: Snapshot = {
    ...snapshot,
    protobaseVersion: previous.header.version,
    endsAt: { file: previous.file, id: previous.header.id },
    modelHash: previous.header.model,
    model,
    decisions: { ...snapshot.decisions, organizations: { ...snapshot.decisions.organizations, everOn: previous.header.organizationsEverOn } },
    physical: auth ? { auth: storeNamesList(auth) } : {},
  }
  await remove()
  await writeSnapshot(projectDir, rebuilt)
  return newest.file
}
