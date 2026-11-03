import { describe, expect, it } from 'vitest'
import type { MergedConfig } from './merge-config'
import { checkUserTables, userTablesOn } from './user-tables-config'

const config = (rest: Partial<MergedConfig>) => ({ sources: [], jobs: {}, writeHooks: [], ...rest }) as MergedConfig

describe('checkUserTables', () => {
  it('takes user tables together with the app\'s own organizations', () => {
    expect(checkUserTables(config({ userTables: true, auth: { organizations: true } })).userTables).toBe(true)
    expect(checkUserTables(config({ userTables: true, auth: { organizations: { create: 'admins' } as never }, authenticate: { organizations: true } })).userTables).toBe(true)
  })
  it('refuses user tables in an API that trusts the organization tokens of an auth server elsewhere, naming both', () => {
    expect(() => checkUserTables(config({ userTables: true, authenticate: { organizations: true } }))).toThrow(/userTables and authenticate\.organizations are both on/)
    expect(() => checkUserTables(config({ userTables: true, auth: {}, authenticate: { organizations: true } }))).toThrow(/authenticate\.organizations/)
  })
  it('takes either one alone, and user tables without sign-in', () => {
    expect(checkUserTables(config({ userTables: true, auth: {} })).userTables).toBe(true)
    expect(checkUserTables(config({ userTables: true })).userTables).toBe(true)
    expect(checkUserTables(config({ userTables: false, authenticate: { organizations: true } })).userTables).toBe(false)
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
