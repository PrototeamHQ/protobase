import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SourceExtension } from './extensions'
import type { DumpedTable } from './load-script'
import type { CronJob, HttpTrigger } from './source-facts'

/** What the dump found in the source, for the load and the report. */
export type ImportManifest = {
  /** The schema migration's file name in the migrations folder. */
  migration: string
  schemas: string[]
  tables: DumpedTable[]
  /** The dumped tables' size on disk in the source, in bytes. */
  bytes: number
  /** Statements of the schema dump the migration leaves out. */
  leftOut: number
  checkout: string[]
  functions: string[]
  /** `undefined` where the importing role could not read them. */
  cronJobs: CronJob[] | undefined
  vaultSecrets: Array<{ name: string | null; description: string }> | undefined
  realtimeTables: Array<{ schema: string; table: string }>
  untrustedExtensions: SourceExtension[]
  httpTriggers: HttpTrigger[]
}

/**
 * The project's folder for an import in progress, kept out of git: the data dump, which holds the users' password
 * hashes and every row, readable by its owner only until the load deletes it; the manifest; and the report.
 */
export const importState = (projectDir: string) => {
  const dir = path.join(projectDir, 'supabase-import')
  const files = { data: path.join(dir, 'data.sql'), load: path.join(dir, 'load.sql'), manifest: path.join(dir, 'import.json'), report: path.join(dir, 'report.md') }
  return {
    dir,
    ...files,
    /** Creates the folder, ignored by git, and an empty data file only its owner may read, for pg_dump to fill. */
    prepare: async () => {
      await mkdir(dir, { recursive: true, mode: 0o700 })
      await ignoreInGit(projectDir, '/supabase-import/')
      await writeFile(files.data, '', { mode: 0o600 })
    },
    hasData: () => existsSync(files.data),
    hasManifest: () => existsSync(files.manifest),
    readManifest: async () => JSON.parse(await readFile(files.manifest, 'utf8')) as ImportManifest,
    writeManifest: (manifest: ImportManifest) => writeFile(files.manifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 }),
  }
}

/** Adds `entry` to the project's .gitignore unless a line already says it. */
const ignoreInGit = async (projectDir: string, entry: string) => {
  const file = path.join(projectDir, '.gitignore')
  const text = existsSync(file) ? await readFile(file, 'utf8') : ''
  if (text.split('\n').some((line) => line.trim() === entry || line.trim() === entry.slice(1))) return
  await appendFile(file, `${text === '' || text.endsWith('\n') ? '' : '\n'}${entry}\n`)
}
