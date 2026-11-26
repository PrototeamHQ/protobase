import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { countOptOuts, unlistedCounts } from './count-opt-outs'

const count = (fixture: string) => countOptOuts(path.join(import.meta.dirname, 'fixtures', fixture))

describe('the opt-out count', () => {
  it('counts the unscoped() calls, not a mention in a comment', () => {
    expect(count('two-unscoped.ts')).toEqual({ unscoped: 2 })
  })

  it("counts a call through a literal key, db['unscoped'](...)", () => {
    expect(count('element-unscoped.ts')).toEqual({ unscoped: 1 })
  })

  it('counts acrossOrganizations() called by an alias, a member or a literal key, not a mention or its definition', () => {
    expect(count('across-organizations.ts')).toEqual({ acrossOrganizations: 3 })
  })

  it('counts everyOrganization() called by its name or an alias, not a mention or its definition', () => {
    expect(count('every-organization.ts')).toEqual({ everyOrganization: 2 })
  })

  it('counts a call whose callee is in parentheses, by its name or an alias, once each', () => {
    expect(count('parenthesized.ts')).toEqual({ acrossOrganizations: 2 })
  })
})

describe('the reviewed list', () => {
  const file = 'packages/server/src/reads.ts'

  it.each(['unscoped', 'acrossOrganizations', 'everyOrganization'] as const)('fails on one %s() use more than the list gives, naming the file, and passes once the list names it', (optOut) => {
    const found = { [file]: { [optOut]: 2 } }
    expect(unlistedCounts(found, { [file]: { [optOut]: 1 } })).toEqual([`${file}: 2 ${optOut}() uses, the reviewed list gives 1: review them and set the list to 2`])
    expect(unlistedCounts(found, { [file]: { [optOut]: 2 } })).toEqual([])
  })

  it('fails on a list that gives more than the file holds, or a file it does not name', () => {
    const found = { [file]: { acrossOrganizations: 1 } }
    expect(unlistedCounts(found, { [file]: { acrossOrganizations: 2 } })).toHaveLength(1)
    expect(unlistedCounts({}, { [file]: { everyOrganization: 1 } })).toHaveLength(1)
    expect(unlistedCounts(found, {})).toHaveLength(1)
  })

  it('holds each opt-out to its own count, so one may not stand in for another', () => {
    expect(unlistedCounts({ [file]: { everyOrganization: 1 } }, { [file]: { unscoped: 1 } })).toHaveLength(2)
  })
})
