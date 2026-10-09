import { describe, expect, it } from 'vitest'
import { f } from './fields'
import { layout as l } from './layout'
import type { ViewModel } from './model'
import { resource } from './resource'
import { view } from './view'

const article = resource('article')
  .table('articles')
  .fields({
    id: f.integer(),
    title: f.text(),
    price: f.decimal({ precision: 10, scale: 2 }),
    status: f.enum(['draft', 'live']),
    featured: f.boolean(),
    createdAt: f.timestamp(),
  })
  .primaryKey((r) => r.id)

const articleView = view<typeof article>('article')
  .names({ singular: 'Article', plural: 'Articles' })
  .icon('newspaper')
  .help('All **articles**')
  .fields((r) => ({
    title: r.title.help('Shown in lists').label('Headline'),
    price: r.price.prefix('€').decimals(2),
    createdAt: r.createdAt.format('relative'),
  }))
  .list((r) => ({
    columns: [r.title, r.price],
    sort: [[r.createdAt, 'desc']],
    search: [r.title],
  }))
  .filters((r, w) => [
    w.range(r.price, { histogram: true }),
    w.facets(r.status, { search: true }),
    w.dateRange(r.createdAt, { presets: ['7d', '30d'] }),
    w.toggle(r.featured),
  ])
  .layout((r) => [l.section('Content', [r.title, r.price], { help: 'Main fields' }), l.sidebar([r.status])])
  .chart((r) => ({ field: r.createdAt, range: '30d', granularity: 'day' }))
  .saveFeedback('toast')
  .actions((a) => [a.action('publish', { label: 'Publish', icon: 'send', confirm: 'Sure?', bulk: true })])

describe('view builder', () => {
  it('builds the expected ViewModel', () => {
    const expected: ViewModel = {
      resource: 'article',
      names: { singular: 'Article', plural: 'Articles' },
      icon: 'newspaper',
      help: 'All **articles**',
      fields: {
        title: { help: 'Shown in lists', label: 'Headline' },
        price: { prefix: '€', decimals: 2 },
        createdAt: { format: 'relative' },
      },
      list: { columns: ['title', 'price'], sort: [['createdAt', 'desc']], search: ['title'] },
      filters: [
        { kind: 'range', field: 'price', histogram: true },
        { kind: 'facets', field: 'status', search: true },
        { kind: 'dateRange', field: 'createdAt', presets: ['7d', '30d'] },
        { kind: 'toggle', field: 'featured' },
      ],
      layout: [
        { kind: 'section', title: 'Content', fields: ['title', 'price'], help: 'Main fields' },
        { kind: 'sidebar', fields: ['status'] },
      ],
      chart: { field: 'createdAt', range: '30d', granularity: 'day' },
      saveFeedback: 'toast',
      actions: [{ name: 'publish', label: 'Publish', icon: 'send', confirm: 'Sure?', bulk: true }],
    }
    expect(articleView.toModel()).toEqual(expected)
  })

  it('starts empty and is serializable', () => {
    const empty = view<typeof article>('article').toModel()
    expect(empty).toEqual({ resource: 'article', fields: {}, filters: [], layout: [], actions: [] })
    expect(JSON.parse(JSON.stringify(articleView.toModel()))).toEqual(articleView.toModel())
  })

  it("labels an enum's values, only with values it has", () => {
    const model = view<typeof article>('article')
      .fields((r) => ({ status: r.status.valueLabels({ draft: 'Concept' }).valueLabels({ live: 'Published' }) }))
      .toModel()
    expect(model.fields.status).toEqual({ valueLabels: { draft: 'Concept', live: 'Published' } })
    // @ts-expect-error `archived` is not one of the status values
    view<typeof article>('article').fields((r) => ({ status: r.status.valueLabels({ archived: 'Archived' }) }))
  })

  it('defaults widget options', () => {
    const model = view<typeof article>('article')
      .filters((r, w) => [w.range(r.price), w.facets(r.status), w.dateRange(r.createdAt)])
      .actions((a) => [a.action('x', { label: 'X' })])
      .toModel()
    expect(model.filters).toEqual([
      { kind: 'range', field: 'price', histogram: false },
      { kind: 'facets', field: 'status', search: false },
      { kind: 'dateRange', field: 'createdAt', presets: [] },
    ])
    expect(model.actions).toEqual([{ name: 'x', label: 'X', bulk: false }])
  })

  it('describes what update, remove and link actions do', () => {
    const model = view<typeof article>('article')
      .actions((a) => [
        a.update('publish', { label: 'Publish', set: { status: 'published' }, confirm: 'Publish now?' }),
        a.remove('discard', { label: 'Discard', icon: 'trash' }),
        a.link('preview', { label: 'Preview', href: 'https://example.com/a/{id}' }),
      ])
      .toModel()
    expect(model.actions).toEqual([
      { name: 'publish', label: 'Publish', bulk: false, confirm: 'Publish now?', run: { kind: 'update', values: { status: 'published' } } },
      { name: 'discard', label: 'Discard', bulk: false, icon: 'trash', run: { kind: 'delete' } },
      { name: 'preview', label: 'Preview', bulk: false, run: { kind: 'link', href: 'https://example.com/a/{id}' } },
    ])
  })

  it('rejects unknown field names at compile time', () => {
    const v = view<typeof article>('article')
    // @ts-expect-error unknown field
    v.list((r) => ({ columns: [r.nope] }))
    // @ts-expect-error unknown field in the field view builder
    v.fields((r) => ({ nope: r.nope.label('x') }))
    // @ts-expect-error unknown field in filters
    v.filters((r, w) => [w.toggle(r.nope)])
    expect(true).toBe(true)
  })

  it('title and nav', () => {
    const model = view<typeof article>('article')
      .title((r) => r.title)
      .nav({ hidden: true, group: 'Sales', order: 2 })
      .toModel(article.toModel())
    expect(model).toMatchObject({ title: 'title', nav: { hidden: true, group: 'Sales', order: 2 } })
    expect(view<typeof article>('article').toModel()).not.toHaveProperty('title')
    // @ts-expect-error unknown field
    view<typeof article>('article').title((r) => r.nope)
  })

  it('rejects a title field the resource does not have', () => {
    const other = resource('other').table('o').fields({ id: f.integer() }).primaryKey((r) => r.id).toModel()
    expect(() => view<typeof article>('article').title((r) => r.title).toModel(other)).toThrow('title field "title" does not exist')
  })

  it('search result title of several fields and a subtitle', () => {
    const build = (v = view<typeof article>('article')) => v.searchResult((r) => ({ title: [r.title, r.status], subtitle: r.price }))
    expect(build().toModel(article.toModel()).searchResult).toEqual({ title: ['title', 'status'], subtitle: 'price' })
    expect(view<typeof article>('article').searchResult((r) => ({ title: r.title })).toModel().searchResult).toEqual({ title: ['title'] })
    const other = resource('other').table('o').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id).toModel()
    expect(() => build().toModel(other)).toThrow('search result field "status" does not exist')
  })
})
