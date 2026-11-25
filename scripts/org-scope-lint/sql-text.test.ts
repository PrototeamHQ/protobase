import { describe, expect, it } from 'vitest'
import { scopedTablesIn } from './sql-text'

const names = [
  { schema: 'auth', table: 'member' },
  { schema: 'auth', table: 'Invitation' },
]

describe('scopedTablesIn', () => {
  it.each([
    ['select * from auth.member', ['auth.member']],
    ['select * from "auth" . "member"', ['auth.member']],
    ['SELECT * FROM AUTH.MEMBER', ['auth.member']],
    ['select auth.member.id from x', ['auth.member']],
    ['update member set role = 1', ['auth.member']],
    ['select * from x join member on true', ['auth.member']],
    ['select * from auth."Invitation"', ['auth.Invitation']],
  ])('finds the table %s names', (text, found) => {
    expect(scopedTablesIn(text, names)).toEqual(found)
  })

  it.each([
    "select 'auth.member', 'member' as role",
    'select m.member from public.member m',
    'select 1 -- from auth.member',
    'select /* auth.member */ 1',
    'select member from x',
    'select * from auth.invitation',
  ])('finds none in %s', (text) => {
    expect(scopedTablesIn(text, names)).toEqual([])
  })
})
