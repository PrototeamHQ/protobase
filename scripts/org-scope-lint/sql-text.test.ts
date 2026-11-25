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
    ['select * from auth.session s, member m', ['auth.member']],
    ['select * from x, y join z on true, member', ['auth.member']],
    ['select * from (select 1) s, member', ['auth.member']],
    ['select $$ x $$ from auth.member', ['auth.member']],
    ['select /* a /* b */ c */ 1 from member', ['auth.member']],
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
    'select $$ auth.member $$',
    'select $body$ from member $body$',
    'select /* outer /* inner */ auth.member */ 1',
    'select a, member from x',
    'select * from x where a = 1 and b in (1, member)',
    'insert into x (a, member) values (1, 2)',
    'select $1::text, member from x',
  ])('finds none in %s', (text) => {
    expect(scopedTablesIn(text, names)).toEqual([])
  })
})
