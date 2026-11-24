import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterFileOf, isAfterFile } from './after-file'
import { recordId } from './record-block'

/** A migration of the folder: its name, text, the id its record block names, and its `.after.sql` when it has one. */
export type DirMigration = { file: string; text: string; id: string | undefined; after: { file: string; text: string } | undefined }

/**
 * The `*.sql` migrations of `dir` in file name order, each with its `.after.sql`. Refuses an `.after.sql` beside no
 * migration, or beside one without a record block, which has no row to mark complete.
 */
export const readMigrationDir = async (dir: string): Promise<DirMigration[]> => {
  const names = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  const migrations = await Promise.all(
    names
      .filter((file) => !isAfterFile(file))
      .map(async (file) => {
        const text = await readFile(path.join(dir, file), 'utf8')
        const afterFile = afterFileOf(file)
        const after = existsSync(path.join(dir, afterFile)) ? { file: afterFile, text: await readFile(path.join(dir, afterFile), 'utf8') } : undefined
        return { file, text, id: recordId(text), after }
      }),
  )
  const orphan = names.filter(isAfterFile).find((file) => !migrations.some(({ after }) => after?.file === file))
  if (orphan) throw new Error(`${orphan} is beside no migration of the same name`)
  const unrecorded = migrations.find(({ after, id }) => after && !id)
  if (unrecorded) throw new Error(`${unrecorded.after!.file} is beside ${unrecorded.file}, which has no record block to mark complete: write it with \`protobase migration --custom <name> --after\``)
  return migrations
}
