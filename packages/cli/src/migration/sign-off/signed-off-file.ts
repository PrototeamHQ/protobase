import type { SignedOff } from '@protobase/server/internal'
import type { MigrationFile } from '../snapshot/migration-files'
import { snapshotFile } from '../snapshot/snapshot-file'

/** The migration with id `id` among `files`, by its id and its name as `migrations.history` records it. */
export const signedOffFile = (files: readonly MigrationFile[], id: string): SignedOff => {
  const found = files.find(({ header }) => header?.id === id)
  if (!found) throw new Error(`The migration ${id} is not among the project's migrations: take back the file that has it, or ${snapshotFile} from before it`)
  return { id, name: found.file.replace(/\.sql$/, '') }
}

/** The hours a sign-off waits, from `--hours`: a whole number, at least 1. */
export const signOffHours = (value: string) => {
  const hours = Number(value)
  if (!Number.isInteger(hours) || hours < 1) throw new Error(`--hours takes a whole number of hours, at least 1, not "${value}"`)
  return hours
}
