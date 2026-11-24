import { describe, expect, it } from 'vitest'
import { latestModel, moduleDifference } from './module-difference'
import type { SchemaModule } from './schema-module'

const fixture = (compatibleFrom: number): SchemaModule => ({
  label: 'the fixture schema',
  title: 'The fixture schema',
  steps: [
    { step: 1, name: 'one', title: 'The first table', additive: true, sql: 'create table one ();' },
    { step: 2, name: 'two', title: 'The second table', additive: true, sql: 'create table two ();' },
  ],
  replaceables: [{ name: 'view', title: 'The view over them', version: 3, compatibleFrom, sql: 'create or replace view v as select 1;' }],
  read: async () => undefined,
})

describe('moduleDifference', () => {
  it('writes the steps after the last one applied, then a replaceable at another version, each under its title', () => {
    expect(moduleDifference(fixture(3), { lastStep: 1, replaceables: { view: 3 } }).sql).toBe('-- The second table.\ncreate table two ();')
    expect(moduleDifference(fixture(3), undefined).sql).toBe('-- The first table.\ncreate table one ();\n\n-- The second table.\ncreate table two ();\n\n-- The view over them.\ncreate or replace view v as select 1;')
    expect(moduleDifference(fixture(3), latestModel(fixture(3))).sql).toBeUndefined()
  })

  it('is additive when the replaceable it replaces is marked compatible with the version the database has', () => {
    expect(moduleDifference(fixture(2), { lastStep: 2, replaceables: { view: 2 } })).toEqual({ sql: '-- The view over them.\ncreate or replace view v as select 1;', breaks: [] })
  })

  it('breaks older code when the replaceable is not marked compatible with it', () => {
    expect(moduleDifference(fixture(3), { lastStep: 2, replaceables: { view: 2 } }).breaks).toEqual(['it replaces its view at version 2 with version 3, which the code before does not run on'])
  })

  it('makes a missing replaceable additively, and refuses a database newer than this version', () => {
    expect(moduleDifference(fixture(3), { lastStep: 2, replaceables: {} }).breaks).toEqual([])
    expect(() => moduleDifference(fixture(3), { lastStep: 3, replaceables: {} })).toThrow('the fixture schema is newer than this version of Protobase writes: upgrade Protobase')
  })
})
