import { describe, expect, it } from 'vitest'
import { runnerBody, runnerSql } from './runner-sql'

const sql = runnerSql()

describe('runnerSql', () => {
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
