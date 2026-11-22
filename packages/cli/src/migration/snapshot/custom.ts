import { storeModel } from '@protobase/server/internal'
import { lastStepsOf } from './auth-difference'
import type { AuthTarget } from './auth-target'
import { refuseInconsistent } from './consistency'
import { readMigrationFiles } from './migration-files'
import { readSnapshot, snapshotFile } from './snapshot-file'
import { writeMigrationFile } from './write-file'

export type CustomMigration = {
  projectDir: string
  dir: string
  name: string
  /** Record the config's auth store in the snapshot: the file makes the store match it, such as a rename. */
  recordConfig: boolean
  auth: AuthTarget | undefined
  protobaseVersion: string
  newId: () => string
}

const body = (recordConfig: boolean) =>
  [
    `-- Written by hand; \`protobase migration --custom\` numbered it and made ${snapshotFile} end at it.`,
    '-- It counts as not additive. Once it only adds, put a line `-- protobase:additive` among the lines above, and `protobase migration check` lints it.',
    ...(recordConfig ? [`-- ${snapshotFile} records the auth store as the config names it now: make the store match it here, such as renaming what the config renamed.`] : []),
    '',
  ].join('\n')

/**
 * `protobase migration --custom <name>`: writes an empty numbered migration for the developer to fill, and makes the
 * snapshot end at it. With `recordConfig`, the snapshot takes the config's auth store names, each module at the step
 * it was. Returns the file's path.
 */
export const writeCustomMigration = async ({ projectDir, dir, name, recordConfig, auth, protobaseVersion, newId }: CustomMigration) => {
  const snapshot = await readSnapshot(projectDir)
  refuseInconsistent(snapshot, await readMigrationFiles(dir))
  const before = snapshot?.model.auth
  const model = recordConfig ? before && auth && storeModel(auth.names, lastStepsOf(before)) : before
  const draft = { previous: snapshot, auth: model, organizationsOn: auth?.organizationsOn ?? false, protobaseVersion }
  return writeMigrationFile(projectDir, dir, { name, body: body(recordConfig), kind: { custom: true, additive: false } }, draft, newId())
}
