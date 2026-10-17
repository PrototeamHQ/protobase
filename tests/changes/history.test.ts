import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { describe, vi } from 'vitest'
import { createJobsPg } from '../../test-support/jobs'
import { historyScenarios } from './history-scenarios'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

describe('record history on PGlite', () => {
  historyScenarios(async () => {
    const pg = await createJobsPg()
    const db = new Kysely<any>({ dialect: new PGliteDialect(pg) })
    return { db, exec: async (text) => void (await pg.exec(text)), close: () => db.destroy() }
  })
})
