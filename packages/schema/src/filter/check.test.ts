import { describe, expect, it } from 'vitest'
import { checkFilter } from './check'
import { invoiceModel } from './fixtures'
import { parseFilter } from './parse'

const run = (source: string) => {
  const parsed = parseFilter(source)
  if (!parsed.ok || !parsed.ast) throw new Error(`parse failed: ${source}`)
  return checkFilter(invoiceModel, parsed.ast)
}
const accepts = (source: string) => expect(run(source), source).toMatchObject({ ok: true })
const errorsOf = (source: string) => {
  const result = run(source)
  if (result.ok) throw new Error(`expected errors: ${source}`)
  return result.errors
}
const rejects = (source: string, code: string) => expect(errorsOf(source)[0], source).toMatchObject({ code })

describe('fields', () => {
  it('resolves fields and aliases to the real field model', () => {
    const result = run('headline = "x"')
    expect(result).toMatchObject({ ok: true, filter: { kind: 'compare', field: { name: 'title', column: 'title' } } })
  })

  it('rejects unknown fields with a suggestion', () => {
    const [error] = errorsOf('stauts = paid')
    expect(error).toMatchObject({ code: 'unknown-field', span: { start: 0, end: 6 } })
    expect(error!.hint).toBe('Did you mean "status"?')
    expect(errorsOf('zzzzzzzzzz = 1')[0]!.hint).toContain('Available fields')
    rejects('constructor = 1', 'unknown-field')
  })

  it('rejects fields that are not filterable', () => {
    const [error] = errorsOf('notes = "x"')
    expect(error).toMatchObject({ code: 'not-filterable' })
    expect(error!.hint).toContain('filterable')
    rejects('isNull(notes)', 'not-filterable')
  })

  it('rejects traversal for now', () => {
    const [error] = errorsOf('customer.country = "NL"')
    expect(error).toMatchObject({ code: 'unsupported-traversal', span: { start: 0, end: 16 } })
    expect(error!.message).toContain('not supported yet')
  })

  it('collects errors from every branch', () => {
    expect(errorsOf('nope = 1 AND notes = "x" OR status = "bad"').map((e) => e.code)).toEqual([
      'unknown-field',
      'not-filterable',
      'invalid-value',
    ])
  })
})

describe('values', () => {
  it('text', () => {
    accepts('title = "x"')
    accepts('title = x')
    rejects('title = 5', 'invalid-value')
    rejects('title = true', 'invalid-value')
  })

  it('integer', () => {
    accepts('id = 5')
    accepts('id = "5"')
    accepts('id >= -5')
    rejects('id = 1e3', 'invalid-value')
    rejects('id = 1.5', 'invalid-value')
    rejects('id = "abc"', 'invalid-value')
    rejects('id = 9007199254740993', 'invalid-value')
  })

  it('bigint is exact and string safe', () => {
    accepts('views = 9007199254740993')
    accepts('views = "9223372036854775807"')
    rejects('views = "9223372036854775808"', 'invalid-value')
    rejects('views = 1.5', 'invalid-value')
    rejects('views = 1e3', 'invalid-value')
  })

  it('decimal is exact and string safe', () => {
    accepts('total > 100')
    accepts('total > 100.50')
    accepts('total = "99999999999999999.99"')
    rejects('total = 1e3', 'invalid-value')
    rejects('total = "1,5"', 'invalid-value')
    rejects('total = true', 'invalid-value')
  })

  it('boolean', () => {
    accepts('active = true')
    rejects('active = "true"', 'invalid-value')
    rejects('active = 1', 'invalid-value')
  })

  it('uuid', () => {
    accepts('ownerId = "0b5a4f0e-6f2a-4a3c-9d4e-1f2a3b4c5d6e"')
    rejects('ownerId = "nope"', 'invalid-value')
  })

  it('enum', () => {
    accepts('status = paid')
    const [error] = errorsOf('status = "gone"')
    expect(error).toMatchObject({ code: 'invalid-value' })
    expect(error!.hint).toBe('Allowed values: draft, paid, sent')
    rejects('in(status, "paid", "gone")', 'invalid-value')
  })

  it('timestamp and date', () => {
    accepts('createdAt > 2012-04-21T11:30:00-04:00')
    accepts('createdAt > "2012-04-21T11:30:00Z"')
    accepts('createdAt > now() - 30d')
    accepts('day = "2024-02-29"')
    accepts('day > now()')
    rejects('createdAt > "yesterday"', 'invalid-value')
    rejects('createdAt > 5', 'invalid-value')
    rejects('day = "2023-02-29"', 'invalid-value')
    rejects('day = 2012', 'invalid-value')
  })

  it('now() only on date fields', () => {
    rejects('id > now()', 'invalid-value')
    rejects('title = now()', 'invalid-value')
  })

  it('currency, country, relation', () => {
    accepts('currency = "EUR"')
    rejects('currency = "eur"', 'invalid-value')
    accepts('country = NL')
    rejects('country = "NLD"', 'invalid-value')
    accepts('customerId = 4')
    accepts('customerId = "abc"')
    rejects('customerId = 1.5', 'invalid-value')
  })
})

describe('operators', () => {
  it('ordering operators need an ordered type', () => {
    accepts('total <= 5')
    accepts('title < "m"')
    rejects('status > paid', 'operator-not-allowed')
    rejects('active < true', 'operator-not-allowed')
    rejects('ownerId >= "0b5a4f0e-6f2a-4a3c-9d4e-1f2a3b4c5d6e"', 'operator-not-allowed')
    expect(errorsOf('status > paid')[0]!.hint).toBe('Supported: = !=')
  })

  it('has is only for json', () => {
    accepts('meta:foo')
    accepts('meta:42')
    rejects('title:foo', 'operator-not-allowed')
    rejects('id:1', 'operator-not-allowed')
  })

  it('json cannot be compared', () => {
    rejects('meta = "x"', 'operator-not-allowed')
    rejects('in(meta, 1)', 'operator-not-allowed')
  })

  it('presence works on every type', () => {
    accepts('meta:*')
    accepts('title:*')
    accepts('createdAt:*')
  })

  it('wildcards only on text', () => {
    accepts('title = "*.foo"')
    accepts('title != "a*b*"')
    rejects('status = "pa*"', 'wildcard-not-allowed')
    rejects('ownerId = "*"', 'wildcard-not-allowed')
    accepts('in(status, "paid")')
  })

  it('similar and regex are text only', () => {
    accepts('similar(title, "x")')
    accepts('regex(headline, "^x")')
    rejects('similar(status, "x")', 'wrong-argument')
    rejects('regex(id, "1")', 'wrong-argument')
  })

  it('search and isNull', () => {
    accepts('hello world')
    accepts('isNull(createdAt)')
    accepts('NOT isNull(meta)')
  })
})

describe('search fields', () => {
  it('search() and bare words need search fields on the resource', () => {
    const bare = { ...invoiceModel, search: undefined }
    const parsed = parseFilter('hello AND search("x")')
    if (!parsed.ok || !parsed.ast) throw new Error('parse failed')
    const result = checkFilter(bare, parsed.ast)
    expect(result.ok ? [] : result.errors.map((e) => e.code)).toEqual(['no-search-fields', 'no-search-fields'])
    expect(checkFilter(invoiceModel, parsed.ast)).toMatchObject({ ok: true })
  })
})
