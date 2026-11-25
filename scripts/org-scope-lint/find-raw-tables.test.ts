import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findRawTables } from './find-raw-tables'
import { scopedNames } from './scoped-names'

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name)
const found = (name: string, names = scopedNames([]), mayDropPlugins = false) =>
  findRawTables(fixture(name), names, mayDropPlugins).map(({ file, line, what }) => `${path.basename(file)}:${line}: ${what.split(' ')[0]}`)

describe('findRawTables', () => {
  it('finds a scoped table in a template literal, qualified, quoted or after a table keyword', () => {
    expect(found('template-literal.ts')).toEqual(['template-literal.ts:3: auth.member', 'template-literal.ts:4: auth.invitation', 'template-literal.ts:5: auth.personal_access_token'])
  })

  it('finds one in sql.raw, in either branch of a condition, and in sql.ref', () => {
    expect(found('sql-raw.ts')).toEqual(['sql-raw.ts:3: auth.member', 'sql-raw.ts:4: auth.invitation', 'sql-raw.ts:5: auth.personal_access_token'])
  })

  it('finds one in CompiledQuery.raw, and none in its bound values', () => {
    expect(found('compiled-query.ts')).toEqual(['compiled-query.ts:3: auth.member'])
  })

  it('finds one through an aliased or namespaced kysely import', () => {
    expect(found('aliased.ts')).toEqual(['aliased.ts:4: auth.member', 'aliased.ts:5: auth.invitation', 'aliased.ts:6: auth.personal_access_token'])
  })

  it('refuses raw SQL with more branches and joins than it checks, rather than checking a few', () => {
    expect(found('many-branches.ts')).toEqual(['many-branches.ts:4: raw'])
  })

  it('finds withoutPlugins() on the transaction a callback gets, unless the file may drop plugins', () => {
    expect(found('without-plugins.ts')).toEqual(['without-plugins.ts:4: withoutPlugins()'])
    expect(found('without-plugins.ts', scopedNames([]), true)).toEqual([])
  })

  it('finds nothing through scoped() and unscoped(), in strings, in comments or in another schema', () => {
    expect(found('scoped.ts')).toEqual([])
  })

  it('finds a scoped table by the name a config gives it', () => {
    const names = scopedNames([fixture('configured/protobase.config.ts')])
    expect(found('configured/query.ts', names)).toEqual(['query.ts:3: people.memberships', 'query.ts:4: people.app_invitation'])
  })
})

describe('scopedNames', () => {
  it('refuses a config whose names it cannot read', () => {
    expect(() => scopedNames([fixture('unreadable/protobase.config.ts')])).toThrow('auth.tables is not a literal')
    expect(() => scopedNames([fixture('spread/protobase.config.ts')])).toThrow('spreads an object or computes a key')
  })
})
