import { describe, expect, it } from 'vitest'
import { pageQueriesLimit, seenOn, seenPagesLimit, seenQueries, type SeenPage } from './seen-pages'

const visit = (pages: SeenPage[], address: string, ...queries: string[]) => queries.reduce((next, query) => seenOn(next, address, query), pages)

describe('the pages the start cache keeps', () => {
  it('notes each query on the page it drew, the latest page first', () => {
    const pages = visit(visit([], '/today', 'a', 'b'), '/tasks', 'c')
    expect(pages).toEqual([
      { address: '/tasks', queries: ['c'] },
      { address: '/today', queries: ['a', 'b'] },
    ])
  })

  it(`keeps only the ${seenPagesLimit} most recent pages`, () => {
    const pages = Array.from({ length: seenPagesLimit + 2 }, (_, index) => `/page-${index}`).reduce((next, address) => visit(next, address, `${address}-query`), [] as SeenPage[])
    expect(pages.map((page) => page.address)).toEqual(['/page-6', '/page-5', '/page-4', '/page-3', '/page-2'])
    expect(seenQueries(pages)).not.toContain('/page-0-query')
  })

  it('starts a page over when it is opened again, so it holds what its latest visit used', () => {
    const pages = visit(visit(visit([], '/today', 'old'), '/tasks', 'c'), '/today', 'new')
    expect(pages).toEqual([
      { address: '/today', queries: ['new'] },
      { address: '/tasks', queries: ['c'] },
    ])
  })

  it(`keeps a page's latest ${pageQueriesLimit} queries`, () => {
    const queries = Array.from({ length: pageQueriesLimit + 10 }, (_, index) => `search-${index}`)
    const [page] = visit([], '/today', ...queries)
    expect(page?.queries).toHaveLength(pageQueriesLimit)
    expect(page?.queries[0]).toBe('search-10')
  })

  it('notes a query once per page', () => {
    expect(visit([], '/today', 'a', 'a')).toEqual([{ address: '/today', queries: ['a'] }])
  })
})
