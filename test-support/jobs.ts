import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { jobsSchemaMigration } from '@protobase/server'
import { fromSnapshot } from './pglite-snapshot'

/** A database with the jobs schema, written as `protobase migration` writes it. */
export const buildJobsPg = async () => {
  const pg = new PGlite()
  await pg.exec((await jobsSchemaMigration(new Kysely<any>({ dialect: new PGliteDialect(pg) })))!)
  return pg
}

export const createJobsPg = () => fromSnapshot('jobs', buildJobsPg)
