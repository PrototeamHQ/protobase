import { describe, expect, it } from 'vitest'
import { f, parseFilter, printFilter, resource, where, checkFilter } from '../index'
import { checkEventFilter } from '../internal'
import { maxRelatedDepth, maxRelatedTerms, relatedErrors, relatedTarget, splitRelated } from './related'

const parsed = (text: string) => {
  const result = parseFilter(text)
  if (!result.ok || !result.ast) throw new Error(`Does not parse: ${text}`)
  return result.ast
}

const claims = resource('claims').table('claims').fields({ id: f.integer().readOnly().filterable(), task_id: f.relation('tasks').filterable(), note: f.text().filterable() }).primaryKey((r) => r.id).toModel()
const links = resource('links').table('links').fields({ objective_id: f.relation('objectives').filterable(), task_id: f.relation('tasks').filterable() }).primaryKey((r) => [r.objective_id, r.task_id]).toModel()

describe('parsing related()', () => {
  it.each([
    'related(task_id, links.task_id, (objective_id = 40))',
    'related(task_id, links.task_id)',
    'related(task_id, links.task_id, (objective_id = 40 AND state != "done")) AND note = "x"',
    'related(id, deps.depends_on_id, (type = "blocked-by" AND related(task_id, links.task_id, (objective_id = 40))))',
    'related(task_id, links.task_id, (objective_id = 40), "created_at desc")',
    'related(task_id, links.task_id, (objective_id = 40), "created_at desc", 2)',
    'related(task_id, links.task_id, (objective_id = 40), "created_at desc", 2, "abc")',
    'related(task_id, links.task_id, "", 10)',
    'related(id, tasks.waits, (state = "open"), "rank", 5)',
    'related(id, a.b, related(c, d.e, (x = 1), "x desc", 3), "y", 2, "t")',
  ])('prints %s back unchanged', (text) => {
    expect(printFilter(parsed(text))).toBe(text)
    expect(printFilter(parsed(printFilter(parsed(text))))).toBe(text)
  })

  it.each([
    'related(task_id)',
    'related(task_id, links)',
    'related(task_id, a.b.c)',
    'related("task_id", links.task_id)',
    'related(task_id, links.task_id, 5)',
    'related(task_id, links.task_id, (x = 1), (y = 2))',
    'related(task_id, links.task_id, (x = 1), 5)',
    'related(task_id, links.task_id, (x = 1), "x", "2")',
    'related(task_id, links.task_id, (x = 1), "x", 0)',
    'related(task_id, links.task_id, (x = 1), "x", -1)',
    'related(task_id, links.task_id, (x = 1), "x", 1.5)',
    'related(task_id, links.task_id, (x = 1), "x", 2, 3)',
    'related(task_id, links.task_id, (x = 1), "x", 2, "t", "u")',
  ])('refuses %s, and never reads it as no filter', (text) => {
    const result = parseFilter(text)
    expect(result.ok).toBe(false)
    expect(result.errors[0]!.message).toContain('related()')
  })

  it('names itself among the functions', () => {
    expect(parseFilter('nope(x)').errors[0]!.hint).toContain('related')
  })

  it("reads the parent's order, limit and page token", () => {
    expect(parsed('related(task_id, links.task_id, (objective_id = 40), "created_at desc", 2, "abc")')).toMatchObject({ kind: 'related', orderBy: 'created_at desc', limit: 2, pageToken: 'abc' })
    expect(parsed('related(task_id, links.task_id, "rank")')).toMatchObject({ kind: 'related', orderBy: 'rank' })
    expect(parsed('related(task_id, links.task_id, "rank")')).not.toHaveProperty('filter')
  })

  it('keeps a token with its quotes and backslashes', () => {
    const term = where.related('task_id', 'links', 'task_id', undefined, { orderBy: 'a', limit: 1, pageToken: 'x"y\\z' })
    expect(parsed(printFilter(term))).toMatchObject({ pageToken: 'x"y\\z' })
  })

  it('where.related prints the same filter', () => {
    expect(printFilter(where.related('task_id', 'links', 'task_id', where.eq('objective_id', 40), { orderBy: 'created_at desc', limit: 2, pageToken: 'abc' }))).toBe('related(task_id, links.task_id, (objective_id = 40), "created_at desc", 2, "abc")')
    expect(printFilter(where.related('task_id', 'links', 'task_id', where.eq('objective_id', 40)))).toBe('related(task_id, links.task_id, (objective_id = 40))')
    expect(printFilter(where.related('task_id', 'links', 'task_id'))).toBe('related(task_id, links.task_id)')
  })
})

describe('checkFilter', () => {
  it.each([
    'related(task_id, links.task_id, (objective_id = 40))',
    'note = "x" AND related(task_id, links.task_id)',
    'NOT related(task_id, links.task_id)',
    'note = "x" OR related(task_id, links.task_id)',
  ])('refuses %s: everything but a read of the API', (text) => {
    const checked = checkFilter(claims, parsed(text))
    expect(checked.ok).toBe(false)
    expect(checked.ok ? [] : checked.errors.map((error) => error.code)).toContain('unsupported-traversal')
  })

  it('so an event or a webhook cannot hold it', () => {
    expect(checkEventFilter(claims, 'related(task_id, links.task_id)')).toMatchObject({ problem: expect.stringContaining('related()') })
  })
})

describe('splitRelated', () => {
  it('leaves a filter without terms as it was written', () => {
    const ast = parsed('note = "x" AND id = 1')
    expect(splitRelated(ast)).toEqual({ terms: [], rest: ast })
  })

  it('takes the terms ANDed at the top out, however they nest', () => {
    const { terms, rest } = splitRelated(parsed('note = "x" AND (related(task_id, a.b) AND id = 1) AND related(task_id, c.d)'))
    expect(terms.map((term) => term.resource)).toEqual(['a', 'c'])
    expect(printFilter(rest!)).toBe('note = "x" AND id = 1')
    expect(splitRelated(parsed('related(task_id, a.b)')).rest).toBeUndefined()
  })
})

describe('relatedErrors', () => {
  const term = (inner = '') => `related(a, b.c${inner})`
  const nest = (depth: number): string => (depth === 1 ? term() : term(`, (${nest(depth - 1)})`))
  const codes = (text: string) => relatedErrors(parsed(text)).map((error) => error.code)

  it('takes what stays inside the caps', () => {
    expect(codes(Array.from({ length: maxRelatedTerms }, () => term()).join(' AND '))).toEqual([])
    expect(codes(nest(maxRelatedDepth))).toEqual([])
    expect(codes('x = 1 OR y = 2')).toEqual([])
  })

  it('counts the terms in subfilters too', () => {
    expect(codes(Array.from({ length: maxRelatedTerms + 1 }, () => term()).join(' AND '))).toEqual(['unsupported'])
    expect(codes(`${term()} AND ${term()} AND ${term(`, (${term()})`)}`)).toEqual(['unsupported'])
  })

  it('refuses a nesting past the depth', () => {
    expect(codes(nest(maxRelatedDepth + 1))).toEqual(['too-deep'])
  })

  it('refuses a term under NOT or OR, and in a group under them', () => {
    expect(codes(`NOT ${term()}`)).toEqual(['unsupported-traversal'])
    expect(codes(`x = 1 OR ${term()}`)).toEqual(['unsupported-traversal'])
    expect(codes(`x = 1 OR (y = 1 AND ${term()})`)).toEqual(['unsupported-traversal'])
    expect(codes(term(`, (x = 1 OR ${term()})`))).toEqual(['unsupported-traversal'])
    expect(codes(term(`, (NOT ${term()})`))).toEqual(['unsupported-traversal'])
  })
})

describe('relatedTarget', () => {
  it('is a relation\'s resource, or the resource itself for its single key', () => {
    expect(relatedTarget(claims, claims.fields.task_id!)).toBe('tasks')
    expect(relatedTarget(claims, claims.fields.id!)).toBe('claims')
    expect(relatedTarget(claims, claims.fields.note!)).toBeUndefined()
    expect(relatedTarget(links, links.fields.task_id!)).toBe('tasks')
  })

  it('is nothing for a part of a composite key that is no relation', () => {
    const pairs = resource('pairs').table('pairs').fields({ a: f.integer().filterable(), b: f.integer().filterable() }).primaryKey((r) => [r.a, r.b]).toModel()
    expect(relatedTarget(pairs, pairs.fields.a!)).toBeUndefined()
  })
})

