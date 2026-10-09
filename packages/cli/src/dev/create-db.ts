import { createRequire } from 'node:module'
import path from 'node:path'
import type { Kysely } from 'kysely'
import { createPgDb } from '../project/pg-db'

// Kysely over the project's own `pg`, shared across reloads so edits do not leak pools.
export const sharedDb = (projectDir: string, url: string) => {
  const store = globalThis as { __protobaseDb?: Kysely<any> }
  if (store.__protobaseDb) return store.__protobaseDb
  const load = createRequire(path.join(projectDir, 'package.json'))
  store.__protobaseDb = createPgDb(load('pg'), url)
  return store.__protobaseDb
}
