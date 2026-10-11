import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nextMigrationName } from '../auth/migration-file'
import type { MigrationPart } from './parts'

/** A part's file: what wrote it and why, then its statements. */
export const partText = (title: string, sql: string) =>
  `-- ${title}, written by \`protobase migration\`.\n-- Applied with the project's other migrations; edit or remove statements the project handles differently.\n\n${sql}\n`

/**
 * Writes what each part still needs as the next migrations in `dir`, one file per part, and returns their paths; none
 * when the database is current. Every part is compared with the database before any file is written, so the
 * project's earlier migrations must be applied to it first.
 */
export const writeMigrations = async (parts: MigrationPart[], dir: string) => {
  const pending: Array<{ part: MigrationPart; sql: string }> = []
  for (const part of parts) {
    const sql = await part.sql()
    if (sql !== undefined) pending.push({ part, sql })
  }
  if (pending.length === 0) return []
  await mkdir(dir, { recursive: true })
  const files: string[] = []
  for (const { part, sql } of pending) {
    const file = path.join(dir, nextMigrationName(await readdir(dir), part.name))
    await writeFile(file, partText(part.title, sql), { flag: 'wx' })
    files.push(file)
  }
  return files
}
