import { describe, expect, it } from 'vitest'
import { queryRunnerSql, runnerBody } from './runner-sql'

const sql = queryRunnerSql({
  grants: [
    { on: 'schema', schema: "o'brien" },
    { on: 'table', schema: "o'brien", name: 'notes' },
  ],
  revokes: [
    { on: 'table', schema: 'auth', name: 'session' },
    { on: 'schema', schema: 'auth' },
  ],
})

describe('queryRunnerSql', () => {
  it('names every schema and table through %I, from a quoted literal', () => {
    expect(sql).toContain(`execute format('grant usage on schema %I to %I', 'o''brien', query_role);`)
    expect(sql).toContain(`execute format('grant select on table %I.%I to %I', 'o''brien', 'notes', query_role);`)
  })

  it('grants, then takes back, in the order planned', () => {
    const at = (text: string) => sql.indexOf(text)
    const order = [
      at("'grant usage on schema %I to %I'"),
      at("'grant select on table %I.%I to %I'"),
      at("'revoke select on table %I.%I from %I', 'auth', 'session'"),
      at("'revoke usage on schema %I from %I', 'auth'"),
    ]
    expect(order.every((index) => index > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('hands the function to the role after creating it, and takes PUBLIC execute away last', () => {
    expect(sql.indexOf(`as $f$${runnerBody}$f$;`)).toBeGreaterThan(0)
    expect(sql.indexOf('alter function query.run_read_only(text, integer) owner to %I')).toBeGreaterThan(sql.indexOf('create or replace function query.run_read_only'))
    expect(sql.trim().endsWith('revoke execute on function query.run_read_only(text, integer) from public;')).toBe(true)
  })

  it('runs the statement as a security definer through a cursor', () => {
    expect(sql).toContain('language plpgsql security definer')
    expect(runnerBody).toContain('open rows no scroll for execute')
  })
})
