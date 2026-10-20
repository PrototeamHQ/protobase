import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nextMigrationName } from '../auth/migration-file'

/** Writes `text` as the next migration in `dir`, named `name` after its number, and returns its file name. */
export const writeMigration = async (dir: string, name: string, text: string) => {
  const file = nextMigrationName(await readdir(dir), name)
  await writeFile(path.join(dir, file), text, { flag: 'wx' })
  return file
}
