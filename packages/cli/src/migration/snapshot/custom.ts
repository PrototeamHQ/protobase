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
  /** Write an empty `.after.sql` beside it too, for statements that cannot run in a transaction. */
  after?: boolean
  auth: AuthTarget | undefined
  protobaseVersion: string
  newId: () => string
}

const body = (recordConfig: boolean) =>
  [
    `-- Written by hand; \`protobase migration --custom\` numbered it and made ${snapshotFile} end at it.`,
    '-- It counts as not additive. Once it only adds, put a line `-- protobase:additive` among the lines above, and `protobase migration check` lints it.',
    '-- Write its statements here, above the row that records it, which stays the last statement.',
    ...(recordConfig ? [`-- ${snapshotFile} records the auth store as the config names it now: make the store match it here, such as renaming what the config renamed.`] : []),
    '',
  ].join('\n')

const afterBody = [
  '-- Run by `protobase migrate` after the migration beside it commits, one statement at a time and outside a transaction,',
  '-- such as `create index concurrently if not exists ...`; each statement ends with a semicolon at the end of a line.',
  '-- The migration is complete once every statement here has run. An index left invalid by a run that stopped is dropped and built again.',
  '',
].join('\n')

/**
 * `protobase migration --custom <name>`: writes an empty numbered migration for the developer to fill, and makes the
 * snapshot end at it. With `recordConfig`, the snapshot takes the config's auth store names, each module at the step
 * it was. Returns the file's path.
 */
export const writeCustomMigration = async ({ projectDir, dir, name, recordConfig, after, auth, protobaseVersion, newId }: CustomMigration) => {
  const snapshot = await readSnapshot(projectDir)
  refuseInconsistent(snapshot, await readMigrationFiles(dir))
  const before = snapshot?.model.auth
  const model = recordConfig ? before && auth && storeModel(auth.names, lastStepsOf(before)) : before
  const draft = { previous: snapshot, auth: model, organizationsOn: auth?.organizationsOn ?? false, protobaseVersion }
  const content = { name, body: body(recordConfig), kind: { custom: true, additive: false }, additive: false, ...(after && { after: afterBody }) }
  return writeMigrationFile(projectDir, dir, content, draft, newId())
}
