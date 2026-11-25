import { describe, expect, it } from 'vitest'
import { grantsSql, revokeSql } from './grants-sql'

describe('grantsSql', () => {
  it('names the table from a quoted literal, and grants nothing while it does not exist', () => {
    const sql = grantsSql({ schema: "o'brien", name: 'notes' })
    expect(sql).toContain(`found regclass := to_regclass('"o''brien"."notes"');`)
    expect(sql).toContain('if found is null then return; end if;')
  })

  it('grants usage on the schema the table resolves to, then select on it', () => {
    const sql = grantsSql({ name: 'notes' })
    expect(sql).toContain(`to_regclass('"notes"')`)
    expect(sql.indexOf("'grant usage on schema %s to %I'")).toBeLessThan(sql.indexOf("'grant select on table %s to %I'"))
  })
})

describe('revokeSql', () => {
  it('takes select back, then usage the role holds itself once it reads no other table of the schema', () => {
    const sql = revokeSql({ schema: 'sales', name: 'orders' })
    const at = (text: string) => sql.indexOf(text)
    expect(at("'revoke select on table %s from %I'")).toBeGreaterThan(0)
    expect(at("privilege_type = 'SELECT'")).toBeGreaterThan(at("'revoke select on table %s from %I'"))
    expect(at("'revoke usage on schema %s from %I'")).toBeGreaterThan(at("privilege_type = 'USAGE')"))
  })
})
