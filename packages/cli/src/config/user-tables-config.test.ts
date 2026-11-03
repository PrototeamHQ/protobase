import { describe, expect, it } from 'vitest'
import type { MergedConfig } from './merge-config'
import { checkUserTables, userTablesOn } from './user-tables-config'

const config = (rest: Partial<MergedConfig>) => ({ sources: [], jobs: {}, writeHooks: [], ...rest }) as MergedConfig

describe('checkUserTables', () => {
  it('refuses user tables together with organizations, naming both', () => {
    expect(() => checkUserTables(config({ userTables: true, auth: { organizations: true } }))).toThrow(/userTables and auth\.organizations are both on/)
    expect(() => checkUserTables(config({ userTables: true, auth: { organizations: { create: 'admins' } as never } }))).toThrow(/userTables and auth\.organizations/)
  })
  it('takes either one alone, and user tables without sign-in', () => {
    expect(checkUserTables(config({ userTables: true, auth: {} })).userTables).toBe(true)
    expect(checkUserTables(config({ userTables: true })).userTables).toBe(true)
    expect(checkUserTables(config({ userTables: false, auth: { organizations: true } })).userTables).toBe(false)
    expect(checkUserTables(config({ auth: { organizations: true } })).userTables).toBeUndefined()
  })
  it('refuses a userTables that is no boolean, so no value turns user tables on past the check', () => {
    expect(() => checkUserTables(config({ userTables: 'true' as never, auth: { organizations: true } }))).toThrow('userTables is "true"; it takes true or false')
    expect(() => checkUserTables(config({ userTables: 1 as never }))).toThrow('it takes true or false')
  })
})

describe('userTablesOn', () => {
  it('is on only for true', () => {
    expect(userTablesOn({ userTables: true })).toBe(true)
    expect(userTablesOn({ userTables: false })).toBe(false)
    expect(userTablesOn({})).toBe(false)
  })
})
