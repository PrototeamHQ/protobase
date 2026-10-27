import { createRequire } from 'node:module'
import path from 'node:path'
import type { AppDatabase } from '../config/build-project'
import { openAppDatabase } from '../project/pg-db'

// Kysely over the `pg` the project's config gets, installed in `packagesDir`, and its pool, shared across reloads so
// edits do not leak pools.
export const sharedDb = (packagesDir: string, url: string): AppDatabase => {
  const store = globalThis as { __protobaseDb?: AppDatabase }
  if (store.__protobaseDb) return store.__protobaseDb
  const load = createRequire(path.join(packagesDir, 'package.json'))
  store.__protobaseDb = openAppDatabase(load('pg'), url)
  return store.__protobaseDb
}
