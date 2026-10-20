import { runDumpPhase, type DumpOptions } from './dump-phase'
import { importState } from './import-state'
import { runLoadPhase } from './load-phase'

export type ImportOptions = Omit<DumpOptions, 'sourceUrl'> & { sourceUrl: string | undefined; configDir: string }

/**
 * `protobase import supabase`, in two runs with the project's migrations between them: the first dumps the source
 * and writes the schema migration, the second loads the data into the migrated database. Which run this is follows
 * from `supabase-import/`: a manifest with its data dump is an import waiting for its load.
 */
export const runSupabaseImport = async (options: ImportOptions, out: (text: string) => void) => {
  const state = importState(options.projectDir)
  const pending = state.hasManifest() && state.hasData()
  if (pending && options.sourceUrl) throw new Error('An import is waiting in supabase-import/: apply its migration and run `protobase import supabase` without a source to load it, or remove supabase-import/ to start over')
  if (pending) return runLoadPhase(options, out)
  if (state.hasManifest()) throw new Error(`This project imported a Supabase database already (see ${state.report}); remove supabase-import/ to import again`)
  if (!options.sourceUrl) throw new Error("Pass the Supabase database's connection string, or --source-env <VARIABLE>: the session pooler's or the direct one, for the postgres role")
  return runDumpPhase({ ...options, sourceUrl: options.sourceUrl }, out)
}
