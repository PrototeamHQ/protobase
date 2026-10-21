import { runDumpPhase, type DumpOptions } from './dump-phase'
import { importState } from './import-state'
import { runLoadPhase } from './load-phase'
import type { StorageSource } from './storage-download'
import { runStorageCopy } from './storage-phase'

export type ImportOptions = Omit<DumpOptions, 'sourceUrl'> & {
  sourceUrl: string | undefined
  configDir: string
  /** The Supabase project to copy Storage's bytes from, once the data is loaded. */
  storage: StorageSource | undefined
  /** Copy Storage's bytes even when they exceed the file provider's quota. */
  yes: boolean
}

/**
 * `protobase import supabase`, in two runs with the project's migrations between them: the first dumps the source
 * and writes the schema migration, the second loads the data into the migrated database. Which run this is follows
 * from `supabase-import/`: a manifest with its data dump is an import waiting for its load. Given a Supabase project
 * to copy Storage's bytes from, the second run copies them after the load, and a later run copies what is left.
 */
export const runSupabaseImport = async (options: ImportOptions, out: (text: string) => void) => {
  const state = importState(options.projectDir)
  const pending = state.hasManifest() && state.hasData()
  const copyStorage = (source: StorageSource) => runStorageCopy({ targetUrl: options.targetUrl, projectDir: options.projectDir, source, yes: options.yes }, out)
  if (pending && options.sourceUrl) throw new Error('An import is waiting in supabase-import/: apply its migration and run `protobase import supabase` without a source to load it, or remove supabase-import/ to start over')
  if (pending) {
    await runLoadPhase(options, out)
    if (options.storage) await copyStorage(options.storage)
    return
  }
  if (state.hasManifest() && options.storage && !options.sourceUrl) return copyStorage(options.storage)
  if (state.hasManifest()) throw new Error(`This project imported a Supabase database already (see ${state.report}); pass --storage-url to copy Storage's files, or remove supabase-import/ to import again`)
  if (options.storage) throw new Error("--storage-url copies Storage's files once the data is loaded; dump the database first")
  if (!options.sourceUrl) throw new Error("Pass the Supabase database's connection string, or --source-env <VARIABLE>: the session pooler's or the direct one, for the postgres role")
  return runDumpPhase({ ...options, sourceUrl: options.sourceUrl }, out)
}
