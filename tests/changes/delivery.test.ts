import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { describe, vi } from 'vitest'
import { createJobsPg } from '../../test-support/jobs'
import { deliveryScenarios } from './delivery-scenarios'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

describe('event delivery on PGlite', () => {
  deliveryScenarios(async () => {
    const pg = await createJobsPg()
    const db = new Kysely<any>({ dialect: new PGliteDialect(pg) })
    return { db, exec: async (text) => void (await pg.exec(text)), close: () => db.destroy() }
  })
})
