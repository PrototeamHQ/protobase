import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { describe } from 'vitest'
import { createEmptyPg } from '../../test-support/pglite-snapshot'
import { captureScenarios } from './capture-scenarios'

describe('change capture on PGlite', () => {
  captureScenarios(async () => {
    const pg = await createEmptyPg()
    const db = new Kysely<any>({ dialect: new PGliteDialect(pg) })
    return { db, exec: async (text) => void (await pg.exec(text)), close: () => db.destroy() }
  })
})
