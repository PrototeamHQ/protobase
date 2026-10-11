import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { describe } from 'vitest'
import { createJobsPg } from '../../test-support/jobs'
import { captureScenarios } from './capture-scenarios'

describe('change capture on PGlite', () => {
  captureScenarios(async () => {
    const pg = await createJobsPg()
    const db = new Kysely<any>({ dialect: new PGliteDialect(pg) })
    return { db, exec: async (text) => void (await pg.exec(text)), close: () => db.destroy() }
  })
})
