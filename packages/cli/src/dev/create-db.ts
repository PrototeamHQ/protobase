import { createRequire } from 'node:module'
import path from 'node:path'
import type { AppDatabase } from '../config/build-project'
import { openAppDatabase } from '../project/pg-db'

// Kysely over the project's own `pg`, and its pool, shared across reloads so edits do not leak pools.
export const sharedDb = (projectDir: string, url: string): AppDatabase => {
  const store = globalThis as { __protobaseDb?: AppDatabase }
  if (store.__protobaseDb) return store.__protobaseDb
  const load = createRequire(path.join(projectDir, 'package.json'))
  store.__protobaseDb = openAppDatabase(load('pg'), url)
  return store.__protobaseDb
}
