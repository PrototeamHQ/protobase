import { readFile } from 'node:fs/promises'
import { PGlite, type PGliteOptions } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { inject, onTestFinished, TestRunner } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    /** Dumped PGlite data directories by fixture name, from `pglite-snapshots.global-setup.ts`. */
    pgliteSnapshots?: Record<string, string>
  }
}

/**
 * Closes `pg` when the test that started it, in its body or a beforeEach, finishes; one started outside a test is left
 * open. A PGlite loaded from a data directory, a snapshot's or a clone's, keeps its memory, about 250 MB, until it is
 * closed, so a file whose tests each started one grew by gigabytes.
 */
export const closeAfterTest = (pg: PGlite) => {
  if (TestRunner.getCurrentTest()) onTestFinished(async () => {
    if (!pg.closed) await pg.close()
  })
  return pg
}

/** A PGlite started from the data directory the global setup dumped as `name` (a fifth of a cold start), or `build()` without one. */
export const fromSnapshot = async (name: string, build: () => Promise<PGlite>, options: PGliteOptions = {}) => {
  const file = inject('pgliteSnapshots')?.[name]
  if (!file) return build()
  const pg = new PGlite({ ...options, loadDataDir: new Blob([await readFile(file)]) })
  await pg.waitReady
  return closeAfterTest(pg)
}

/** A copy of `pg`, closed when the test that made it finishes. */
export const cloneForTest = async (pg: PGlite) => closeAfterTest((await pg.clone()) as PGlite)

export const buildEmptyPg = async () => new PGlite()

/** An empty database. */
export const createEmptyPg = () => fromSnapshot('empty', buildEmptyPg)

const trigramOptions = { extensions: { pg_trgm } }

export const buildTrigramPg = async () => {
  const pg = new PGlite(trigramOptions)
  await pg.exec('create extension pg_trgm')
  return pg
}

/** An empty database with pg_trgm, for tables whose text filters and search need trigram indexes. */
export const createTrigramPg = () => fromSnapshot('trigram', buildTrigramPg, trigramOptions)
