import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compileFilter } from '../src/compile-filter'
import { QueryError } from '../src/errors'
import { check, createTestDb, field, items, model } from '../../../test-support/query'

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => { ctx = await createTestDb({ trigram: true }) })
afterAll(async () => { await ctx.db.destroy() })

const count = async (source: string) => {
  const row = await ctx.db.selectFrom('items as t').select(ctx.db.fn.countAll<string>().as('n')).where(compileFilter(items, check(items, source))).executeTakeFirstOrThrow()
  return Number(row.n)
}
const direct = async (where: string) => Number((await ctx.pg.query<{ n: string }>(`select count(*)::text as n from items where ${where}`)).rows[0]!.n)

describe('operators', () => {
  const cases: Array<[string, string, string]> = [
    ['text =', 'name = "item-5"', `name = 'item-5'`],
    ['text !=', 'name != "item-5"', `name <> 'item-5'`],
    ['text in', 'in(name, "item-1", "item-2", "nope")', `name in ('item-1','item-2')`],
    ['text wildcard both sides', 'name = "*EM-10*"', `name ilike '%em-10%'`],
    ['text wildcard prefix', 'name = "item-99*"', `name ilike 'item-99%'`],
    ['text wildcard negated', 'name != "item-1*"', `name not ilike 'item-1%'`],
    ['wildcard escapes %', 'note = "*100%"', `note like '%100\\%'`],
    ['wildcard escapes _', 'note = "under_score*"', `note like 'under\\_score%'`],
    ['wildcard with commas', 'note = "alpha, beta*"', `note like 'alpha, beta%'`],
    ['text < >', 'name > "item-9" AND name < "item-95"', `name > 'item-9' and name < 'item-95'`],
    ['regex', 'regex(name, "^item-[0-9]{2}$")', `name ~* '^item-[0-9]{2}$'`],
    ['search words', 'search("quick fox")', `note = 'Quick brown fox'`],
    ['search prefix', 'search("qui")', `note = 'Quick brown fox'`],
    ['search infix', 'search("row")', `note = 'Quick brown fox'`],
    ['search ignores case', 'search("QUICK BROWN")', `note = 'Quick brown fox'`],
    ['search words across fields', 'search("item-12 fox")', `name like 'item-12%' and note = 'Quick brown fox'`],
    ['search no match', 'search("zebra")', `false`],
    ['search minus is literal', 'search("quick -fox")', `false`],
    ['search escapes %', 'search("100%")', `note like '%100\\%%'`],
    ['search escapes _', 'search("item_1")', `false`],
    ['search escapes backslash', 'search("\\\\")', `false`],
    ['NOT search', 'NOT search("fox")', `note <> 'Quick brown fox'`],
    ['bare word is search', 'quick', `note = 'Quick brown fox'`],
    ['isNull', 'isNull(note)', `note is null`],
    ['NOT isNull', 'NOT isNull(note)', `note is not null`],
    ['present', 'note:*', `note is not null`],
    ['int =', 'qty = 5', `qty = 5`],
    ['int <', 'qty < 5', `qty < 5`],
    ['int <=', 'qty <= 5', `qty <= 5`],
    ['int >', 'qty > 95', `qty > 95`],
    ['int >=', 'qty >= 95', `qty >= 95`],
    ['int range', 'qty >= 10 AND qty <= 20', `qty between 10 and 20`],
    ['int in', 'in(qty, 1, 2, 3)', `qty in (1,2,3)`],
    ['bigint', 'big > 9000000000000', `big > 9000000000000`],
    ['bigint in (quoted)', 'in(big, 1000000000, "2000000000")', `big in (1000000000, 2000000000)`],
    ['decimal range', 'price >= 10.5 AND price <= 20', `price between 10.5 and 20`],
    ['decimal =', 'price = "0.25"', `price = 0.25`],
    ['date >=', 'born >= "2024-12-01"', `born >= '2024-12-01'`],
    ['timestamp literal', 'created_at < 2024-01-03T00:00:00Z', `created_at < '2024-01-03T00:00:00Z'`],
    ['timestamp string', 'created_at >= "2024-02-01T00:00:00Z" AND created_at < "2024-03-01T00:00:00Z"', `created_at >= '2024-02-01T00:00:00Z' and created_at < '2024-03-01T00:00:00Z'`],
    ['timestamp now offset', 'created_at < now() - 30d', `created_at < now() - interval '30 days'`],
    ['timestamp now plus', 'created_at > now() + 1h', `created_at > now() + interval '1 hour'`],
    ['timestamp now', 'created_at <= now()', `created_at <= now()`],
    ['date now offset', 'born >= now() - 90d', `born >= (now() - interval '90 days')::date`],
    ['enum in', 'in(category, "red", "blue")', `category in ('red','blue')`],
    ['enum =', 'category = "red"', `category = 'red'`],
    ['enum !=', 'category != "red"', `category <> 'red'`],
    ['boolean =', 'active = true', `active = true`],
    ['uuid =', 'ref = "00000000-0000-0000-0000-000000000000"', `false`],
    ['json key', 'attrs:"tag"', `attrs ? 'tag'`],
    ['json array element', 'attrs:"x"', `attrs ? 'x'`],
    ['json present', 'attrs:*', `attrs is not null and attrs <> 'null'::jsonb`],
    ['and/or/not', '(qty < 3 OR qty > 97) AND NOT active = true', `(qty < 3 or qty > 97) and not active`],
    ['implicit and', 'qty = 5 active = true', `qty = 5 and active = true`],
  ]
  it.each(cases)('%s', async (_, source, where) => {
    expect(await count(source)).toBe(await direct(where))
  })

  it('uuid = and in match a real row', async () => {
    const { rows } = await ctx.pg.query<{ ref: string }>(`select ref from items where id = 7`)
    const ref = rows[0]!.ref
    expect(await count(`ref = "${ref}"`)).toBe(1)
    expect(await count(`in(ref, "${ref}", "${ref.toUpperCase()}")`)).toBe(1)
  })

  it('search without words matches nothing', async () => {
    for (const text of ['', '  ']) {
      const row = await ctx.db.selectFrom('items as t').select(ctx.db.fn.countAll<string>().as('n'))
        .where(compileFilter(items, { kind: 'search', text, span: { start: 0, end: 0 } })).executeTakeFirstOrThrow()
      expect(Number(row.n)).toBe(0)
    }
  })

  it('search matches the literal wildcard characters', async () => {
    expect(await count('search("%")')).toBe(await direct(`note = 'under_score 100%'`))
    expect(await count('search("r_s")')).toBe(await direct(`note = 'under_score 100%'`))
  })

  it('similar finds near matches with pg_trgm', async () => {
    expect(await count('similar(name, "item-1234")')).toBeGreaterThan(0)
    expect(await count('similar(name, "zzzzzzzzzz")')).toBe(0)
  })

  it('applies the requested similarity threshold', async () => {
    const strict = ctx.db.selectFrom('items as t').select(ctx.db.fn.countAll<string>().as('n'))
      .where(compileFilter(items, check(items, 'similar(name, "item-1234")'), { similarityThreshold: 0.9 }))
    const loose = ctx.db.selectFrom('items as t').select(ctx.db.fn.countAll<string>().as('n'))
      .where(compileFilter(items, check(items, 'similar(name, "item-1234")')))
    expect(Number((await strict.executeTakeFirstOrThrow()).n)).toBeLessThan(Number((await loose.executeTakeFirstOrThrow()).n))
  })
})

describe('refusals', () => {
  const noSearch = model('plain', ['id'], [field('id', 'integer'), field('name', 'text')])

  it('throws when the resource has no search fields, even if the checker was bypassed', () => {
    const search = { kind: 'search', text: 'x', span: { start: 0, end: 0 } } as const
    expect(() => compileFilter(noSearch, search)).toThrowError(expect.objectContaining({ code: 'no_search_fields' }))
  })

  it('is refused earlier by the checker', () => {
    expect(() => check(noSearch, 'search("x")')).toThrow(/search/i)
  })

  it('rejects over-long regexes and bad thresholds', () => {
    expect(() => compileFilter(items, check(items, `regex(name, "${'a'.repeat(201)}")`))).toThrowError(expect.objectContaining({ code: 'invalid_value' }))
    expect(() => compileFilter(items, check(items, 'qty = 1'), { similarityThreshold: 0.1 })).toThrowError(expect.objectContaining({ code: 'invalid_option' }))
  })

  // Starting a second PGlite (WASM) takes seconds when the whole suite runs in parallel, so the default 5s is too tight.
  it('reports a missing pg_trgm clearly instead of a raw Postgres error', async () => {
    const bare = await createTestDb({ seed: false })
    const { listQuery } = await import('../src/list-query')
    await expect(listQuery(bare.db, items, { limit: 5, filter: check(items, 'similar(name, "item")') })).rejects.toMatchObject({ code: 'missing_extension' })
    await bare.db.destroy()
  }, 30_000)
})

describe('injection', () => {
  const attack = `'; drop table items; --`
  it('binds user text as a parameter', async () => {
    const compiled = ctx.db.selectFrom('items as t').selectAll().where(compileFilter(items, check(items, `name = "*${attack}*"`))).compile()
    expect(compiled.sql).not.toContain('drop table')
    expect(compiled.parameters).toContain(`%${attack}%`)
  })

  it('binds every text-taking operator and survives execution', async () => {
    const quoted = JSON.stringify(attack)
    expect(await count(`in(name, ${quoted}, "x' or '1'='1")`)).toBe(0)
    expect(await count(`regex(name, ${quoted})`)).toBe(0)
    expect(await count(`search(${quoted})`)).toBe(0)
    expect(await count(`similar(name, ${quoted})`)).toBe(0)
    expect(await count(`attrs:${quoted}`)).toBe(0)
    expect(await direct('true')).toBe(10000)
  })
})
