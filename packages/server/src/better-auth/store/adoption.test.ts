import { describe, expect, it } from 'vitest'
import { NameClash } from '../names/resolve-names'
import { settingsStoreNames } from './offline/settings-names'
import { stepTableNames } from './adoption'

describe('the tables a store without any record is looked for by', () => {
  it('names a table of a module that is off apart, so an enabled user table may take its name', () => {
    const names = stepTableNames(settingsStoreNames({ tables: { user: { name: 'organization' } } }))
    expect(names.has('organization')).toBe(false)
    expect(names.has('member')).toBe(true)
    expect(names.has('session')).toBe(true)
  })

  it('still refuses one name for two tables of modules that are on', () => {
    expect(() => stepTableNames(settingsStoreNames({ tables: { session: { name: 'account' } } }))).toThrow(NameClash)
  })
})
