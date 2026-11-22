import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseHeader, type Header } from './header'

/** A numbered migration of the project's folder; `header` when Protobase wrote it. */
export type MigrationFile = { file: string; number: number; text: string; header?: Header }

const numbered = /^(\d+)_.*\.sql$/

/** The numbered migrations of `dir`, by number then name; none when it does not exist. */
export const readMigrationFiles = async (dir: string): Promise<MigrationFile[]> => {
  if (!existsSync(dir)) return []
  const names = (await readdir(dir)).filter((file) => numbered.test(file)).sort()
  const files = await Promise.all(
    names.map(async (file) => {
      const text = await readFile(path.join(dir, file), 'utf8')
      const header = parseHeader(text)
      return { file, number: Number(numbered.exec(file)![1]), text, ...(header && { header }) }
    }),
  )
  return files.sort((a, b) => a.number - b.number || a.file.localeCompare(b.file))
}

/** The files of each number two or more of them share, such as one from each of two merged branches. */
export const sharedNumbers = (files: MigrationFile[]) =>
  [...new Set(files.map(({ number }) => number))].map((number) => files.filter((file) => file.number === number)).filter((same) => same.length > 1)

/** The files Protobase wrote, in order. */
export const protobaseFiles = (files: MigrationFile[]) => files.filter((file): file is MigrationFile & { header: Header } => file.header !== undefined)
