import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { matchesSearch } from '@protobase/schema'
import { compileFilter } from '../src/compile-filter'
import { check, createTestDb, field, model } from '../../../test-support/query'

const contacts = model(
  'contacts',
  ['id'],
  [field('id', 'integer'), field('name', 'text'), field('phone', 'text', { nullable: true }), field('mobile', 'bigint', { nullable: true })],
  { search: ['name', 'phone', 'mobile'], searchMatch: { phone: 'digitsEnd', mobile: 'digitsEnd' } },
)

const rows = [
  { id: 1, name: 'Anouk de Vries', phone: '+31 6 47069623', mobile: null },
  { id: 2, name: 'Bram 9623 Smit', phone: '+31-20-555-0101', mobile: null },
  { id: 3, name: 'Chris Jansen', phone: null, mobile: 31647069623 },
  { id: 4, name: 'Dewi Bakker', phone: '(020) 555 9623', mobile: null },
]

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => {
  ctx = await createTestDb({ seed: false })
  await ctx.pg.exec('create table contacts (id integer primary key, name text not null, phone text, mobile bigint)')
  for (const row of rows) await ctx.pg.query('insert into contacts values ($1, $2, $3, $4)', [row.id, row.name, row.phone, row.mobile])
})
afterAll(async () => { await ctx.db.destroy() })

const found = async (source: string) => {
  const result = await ctx.db.selectFrom('contacts as t').select('id').where(compileFilter(contacts, check(contacts, source))).orderBy('id').execute()
  return result.map((row) => row.id as number)
}

describe('search on digitsEnd fields', () => {
  const cases: Array<[string, string, number[]]> = [
    ['the last digits', 'search("9623")', [1, 2, 3, 4]],
    ['a longer end', 'search("47069623")', [1, 3]],
    ['the end written with spaces', 'search("+31 6 47069623")', [1, 3]],
    ['the end written with dashes', 'search("555-0101")', [2]],
    ['a non-text column', 'search("31647069623")', [1, 3]],
    ['not the start', 'search("+316")', []],
    ['not the middle', 'search("4706")', []],
    ['not a middle fragment with spaces', 'search("6 4706")', []],
    ['words still match plain fields', 'search("anouk")', [1]],
    ['a word and a phone end together', 'search("anouk 9623")', [1]],
    ['a phone end and a wrong name', 'search("bakker 47069623")', []],
    ['letters never match digits', 'search("a9623")', []],
    ['bare words', '9623 dewi', [4]],
    ['NOT search keeps null phones', 'NOT search("0101")', [1, 3, 4]],
  ]

  it.each(cases)('%s', async (_, source, ids) => {
    expect(await found(source)).toEqual(ids)
  })

  it('agrees with the in-memory rules the client uses', async () => {
    for (const [, source, ids] of cases.filter(([, source]) => source.startsWith('search('))) {
      const text = JSON.parse(source.slice('search('.length, -1)) as string
      expect(rows.filter((row) => matchesSearch(contacts, row, text)).map((row) => row.id)).toEqual(ids)
    }
  })
})
