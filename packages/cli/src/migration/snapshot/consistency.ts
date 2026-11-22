import { modelHash, snapshotFile, type Snapshot } from './snapshot-file'
import { protobaseFiles, sharedNumbers, type MigrationFile } from './migration-files'

/**
 * What makes the snapshot disagree with the migration files, one line each: two files sharing a number, as after
 * merging two branches that each wrote one, a snapshot that does not end at the newest file Protobase wrote, or one
 * whose model was edited since it was written. None when they agree.
 */
export const inconsistencies = (snapshot: Snapshot | undefined, files: MigrationFile[]) => {
  const shared = sharedNumbers(files).map((same) => `${same.map(({ file }) => file).join(' and ')} share a number`)
  const newest = protobaseFiles(files).at(-1)
  if (!snapshot) return newest ? [...shared, `${newest.file} was written by \`protobase migration\`, and the project has no ${snapshotFile}`] : shared
  const ends =
    newest === undefined
      ? [`${snapshotFile} ends at ${snapshot.endsAt.file}, which is not among the migrations`]
      : newest.header.id === snapshot.endsAt.id
        ? []
        : [`${snapshotFile} ends at ${snapshot.endsAt.file}, not at the newest migration Protobase wrote, ${newest.file}`]
  const edited = modelHash(snapshot.model) === snapshot.modelHash ? [] : [`${snapshotFile}'s model does not match its modelHash: it was edited or merged by hand`]
  return [...shared, ...ends, ...edited]
}

/** How to resolve them once two branches each wrote a migration. */
export const resolveHint = `Delete this branch's newest migration, take the other branch's ${snapshotFile}, and run \`protobase migration\` again.`

/** Refuses to go on while the snapshot disagrees with the files. */
export const refuseInconsistent = (snapshot: Snapshot | undefined, files: MigrationFile[]) => {
  const found = inconsistencies(snapshot, files)
  if (found.length > 0) throw new Error(`${found.join('; ')}. ${resolveHint}`)
}
