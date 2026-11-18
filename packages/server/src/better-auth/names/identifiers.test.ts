import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { ddlText } from '../store/ddl'
import { columnId, indexId, tableId } from './identifiers'

describe('the resolved names', () => {
  const table = tableId('app_auth', 'login "sessions"')
  const column = columnId(table, 'expires_at')

  it('print themselves inside the sql template, quoted', () => {
    expect(ddlText(sql`select ${column} from ${table} where ${indexId(table, 'x_idx')} is null`)).toBe('select "expires_at" from "app_auth"."login ""sessions""" where "x_idx" is null')
    expect(ddlText(sql`select from ${tableId(undefined, 'user')}`)).toBe('select from "user"')
  })

  it('print themselves as quoted text', () => {
    expect(String(table)).toBe('"app_auth"."login ""sessions"""')
    expect(`${column}`).toBe('"expires_at"')
    expect(String(tableId(undefined, 'user'))).toBe('"user"')
  })

  it('keep their readable parts, and a plain name for the typed builder', () => {
    expect(table).toMatchObject({ schema: 'app_auth', table: 'login "sessions"', name: 'login "sessions"' })
    expect(column).toMatchObject({ schema: 'app_auth', table: 'login "sessions"', column: 'expires_at', name: 'expires_at' })
  })
})
