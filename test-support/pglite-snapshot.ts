import { readFile } from 'node:fs/promises'
import { PGlite, type PGliteOptions } from '@electric-sql/pglite'
import { inject } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    /** Dumped PGlite data directories by fixture name, from `pglite-snapshots.global-setup.ts`. */
    pgliteSnapshots?: Record<string, string>
  }
}

/** A PGlite started from the data directory the global setup dumped as `name` (a fifth of a cold start), or `build()` without one. */
export const fromSnapshot = async (name: string, build: () => Promise<PGlite>, options: PGliteOptions = {}) => {
  const file = inject('pgliteSnapshots')?.[name]
  if (!file) return build()
  const pg = new PGlite({ ...options, loadDataDir: new Blob([await readFile(file)]) })
  await pg.waitReady
  return pg
}

export const buildEmptyPg = async () => new PGlite()

/** An empty database. */
export const createEmptyPg = () => fromSnapshot('empty', buildEmptyPg)
