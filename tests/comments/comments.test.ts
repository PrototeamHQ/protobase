import { Kysely } from 'kysely'
import { describe, vi } from 'vitest'
import { commentsScenarios } from './comments-scenarios'
import { openSnapshotDb, type SnapshotDb } from '../../test-support/sql-snapshot'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

describe('record comments on SnapshotDb', () => {
  commentsScenarios(async () => {
    const pg = await openSnapshotDb('jobs')
    const db = new Kysely<any>({ dialect: pg.dialect })
    return { db, exec: async (text) => void (await pg.exec(text)), close: () => db.destroy() }
  })
})
