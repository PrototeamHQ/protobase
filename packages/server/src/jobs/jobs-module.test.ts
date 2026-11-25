import { createRequire } from 'node:module'
import { getConstructionPlans } from 'pg-boss'
import { describe, expect, it } from 'vitest'
import { latestModel, moduleDifference } from '../schema-modules/module-difference'
import { noInput } from '../schema-modules/schema-module'
import { functionsVersion } from './functions-sql'
import { functionsModel, jobsModule, pgBossSteps } from './jobs-module'
import { migrationStatements } from './schema'
import { pgBoss45 } from './steps/001-pg-boss-45'

describe('the jobs module', () => {
  it("pins the pg-boss installed: its last pg-boss step is the package's schema version", () => {
    const require = createRequire(import.meta.url)
    const { pgboss } = require('pg-boss/package.json') as { pgboss: { schema: number } }
    expect(Object.values(pgBossSteps).at(-1)).toBe(pgboss.schema)
  })

  // A pg-boss bump fails this until its migration plan from 45 is copied into step 2, which this test then compares.
  it("has step 1 as pg-boss's own construction plan of the version pinned", () => {
    expect(pgBoss45).toBe(migrationStatements(getConstructionPlans('jobs')))
  })

  it('is at its last step with the functions this version writes', () => {
    expect(latestModel(jobsModule)).toEqual({ lastStep: 1, replaceables: { functions: functionsVersion } })
  })

  it('writes every step then the functions on a database without it, and only older functions again', () => {
    const fresh = moduleDifference(jobsModule, noInput, undefined)
    expect(fresh.breaks).toEqual([])
    expect(fresh.sql).toMatch(/^-- pg-boss's tables at its schema version 45\.\nSELECT pg_advisory_xact_lock/)
    expect(fresh.sql).toContain("-- Protobase's functions of the jobs schema.\ncreate or replace function jobs.enqueue(")
    expect(moduleDifference(jobsModule, noInput, latestModel(jobsModule)).sql).toBeUndefined()
    const older = moduleDifference(jobsModule, noInput, { lastStep: 1, replaceables: { functions: functionsVersion - 1 } })
    expect(older.sql).toMatch(/^-- Protobase's functions of the jobs schema\.\ncreate or replace function jobs\.enqueue\(/)
    expect(older.breaks).toEqual([`it replaces its functions at version ${functionsVersion - 1} with version ${functionsVersion}, which the code before does not run on`])
  })

  it("reads the functions at their oldest version, absent when one is missing and none is older, and refuses newer ones", () => {
    const current = functionsVersion
    expect(functionsModel([current, current, current, current])).toEqual({ functions: current })
    expect(functionsModel([current, current - 1, current, current])).toEqual({ functions: current - 1 })
    expect(functionsModel([undefined, current, current, current])).toEqual({})
    expect(functionsModel([undefined, undefined, undefined, undefined])).toEqual({})
    // One missing beside an older one: written again from the older version, which says what that breaks.
    expect(functionsModel([undefined, current - 1, current, current])).toEqual({ functions: current - 1 })
    expect(moduleDifference(jobsModule, noInput, { lastStep: 1, replaceables: functionsModel([undefined, current - 1, current, current]) }).breaks).toHaveLength(1)
    expect(() => functionsModel([current + 1, current - 1, current, current])).toThrow(`Protobase's functions of the jobs schema are at version ${current + 1}, newer than the ${current} this version of Protobase writes: upgrade Protobase`)
  })
})
