import { describe, expect, it } from 'vitest'
import { f } from './fields'
import { layout as l } from './layout'
import type { ListDisplayModel, ViewModel } from './model'
import { resource } from './resource'
import { view } from './view'
import { displayFields, type displays } from './view-displays'

const article = resource('article')
  .table('articles')
  .fields({
    id: f.integer(),
    title: f.text(),
    price: f.decimal({ precision: 10, scale: 2 }),
    status: f.enum(['draft', 'live']),
    featured: f.boolean(),
    pinned: f.boolean(),
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
    w.flags([r.featured, r.pinned], { label: 'Highlighted' }),
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
        { kind: 'flags', fields: ['featured', 'pinned'], label: 'Highlighted' },
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

  it('shows a field with the field type a plugin registers, with its props', () => {
    const model = view<typeof article>('article')
      .fields((r) => ({ price: r.price.label('Price').widget('stars', { max: 5 }), title: r.title.widget('slug') }))
      .toModel()
    expect(model.fields.price).toEqual({ label: 'Price', widget: { name: 'stars', props: { max: 5 } } })
    expect(model.fields.title).toEqual({ widget: { name: 'slug' } })
  })

  it('takes only boolean fields as flags', () => {
    // @ts-expect-error `status` is an enum, not a boolean
    view<typeof article>('article').filters((r, w) => [w.flags([r.featured, r.status], { label: 'Highlighted' })])
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
        a.link('drafts', { label: 'Drafts', to: { kind: 'list', resource: 'article', filter: 'status = "draft"' } }),
      ])
      .toModel()
    expect(model.actions).toEqual([
      { name: 'publish', label: 'Publish', bulk: false, confirm: 'Publish now?', run: { kind: 'update', values: { status: 'published' } } },
      { name: 'discard', label: 'Discard', bulk: false, icon: 'trash', run: { kind: 'delete' } },
      { name: 'preview', label: 'Preview', bulk: false, run: { kind: 'link', href: 'https://example.com/a/{id}' } },
      { name: 'drafts', label: 'Drafts', bulk: false, run: { kind: 'link', to: { kind: 'list', resource: 'article', filter: 'status = "draft"' } } },
    ])
  })

  it('adds card and custom displays beside the table, field references in props marked', () => {
    const Board = Object.assign((props: { by: string; columns: number }) => props, { blockName: 'Board', custom: true })
    const model = view<typeof article>('article')
      .list((r, d) => ({
        columns: [r.title, r.price],
        displays: [d.cards({ subtitle: r.price, badge: r.status, meta: [r.createdAt] }), d.custom(Board, { name: 'board', label: 'Board', icon: 'kanban', fields: [r.title, r.status], props: { by: r.status, columns: 3 } })],
        default: 'board',
      }))
      .toModel(article.toModel())
    expect(model.list).toEqual({
      columns: ['title', 'price'],
      displays: [
        { kind: 'cards', name: 'cards', subtitle: 'price', badge: 'status', meta: ['createdAt'] },
        { kind: 'custom', name: 'board', label: 'Board', icon: 'kanban', component: 'Board', fields: ['title', 'status'], props: { by: { $field: 'status' }, columns: 3 } },
      ],
      default: 'board',
    })
  })

  it("puts a card's amount fields and footer fields in the model, and checks them like its other fields", () => {
    const model = view<typeof article>('article')
      .list((r, d) => ({ columns: [r.title], displays: [d.cards({ amount: [r.price], footer: [r.status, r.createdAt] })] }))
      .toModel(article.toModel())
    expect(model.list?.displays).toEqual([{ kind: 'cards', name: 'cards', amount: ['price'], footer: ['status', 'createdAt'] }])
    expect(displayFields(model.list!.displays![0]!)).toEqual(['price', 'status', 'createdAt'])
  })

  it("draws each card's content with a component of the project or a plugin, given by its name", () => {
    const ArticleCard = Object.assign(() => null, { blockName: 'ArticleCard', custom: true })
    const model = view<typeof article>('article')
      .list((r, d) => ({ columns: [r.title], displays: [d.cards({ title: r.title, meta: [r.price] }, { card: ArticleCard })] }))
      .toModel(article.toModel())
    expect(model.list?.displays).toEqual([{ kind: 'cards', name: 'cards', title: 'title', meta: ['price'], card: 'ArticleCard' }])
    const Built = Object.assign(() => null, { blockName: 'Card', custom: false })
    expect(() => view<typeof article>('article').list((r, d) => ({ columns: [r.title], displays: [d.cards({}, { card: Built })] }))).toThrow('d.cards card takes a component declared with component(...), not the built-in block Card')
  })

  it("names where a card's further photos come from, as data the caller's photos cannot change", () => {
    const photos = { resource: 'article_photos', field: 'article_id', image: 'photo', sort: 'position' }
    const model = view<typeof article>('article')
      .list((r, d) => ({ columns: [r.title], displays: [d.cards({ title: r.title }, { photos })] }))
      .toModel(article.toModel())
    photos.sort = 'id'
    expect(model.list?.displays).toEqual([{ kind: 'cards', name: 'cards', title: 'title', photos: { resource: 'article_photos', field: 'article_id', image: 'photo', sort: 'position' } }])
  })

  it('refuses displays that collide, a default that is none of them, and built-in blocks as components', () => {
    const list = (pick: (d: typeof displays) => { displays: ListDisplayModel[]; default?: string }) => () =>
      view<typeof article>('article').list((r, d) => ({ columns: [r.title], ...pick(d) }))
    expect(list((d) => ({ displays: [d.cards({}), d.cards({})] }))).toThrow('View "article": display "cards" is defined twice')
    expect(list((d) => ({ displays: [d.cards({}, { name: 'table' })] }))).toThrow('"table" is the list\'s own display')
    expect(list((d) => ({ displays: [d.cards({})], default: 'board' }))).toThrow('default "board" is not one of the displays (table, cards)')
    expect(list((d) => ({ displays: [d.cards({}, { name: 'Big cards' })] }))).toThrow('display name "Big cards" must start with a lowercase letter')
    const Card = Object.assign(() => null, { blockName: 'Card', custom: false })
    expect(list((d) => ({ displays: [d.custom(Card, { name: 'c', label: 'C', fields: [] })] }))).toThrow('d.custom takes a component declared with component(...), not the built-in block Card')
  })

  it('puts custom components in the record layout, in the main column or the sidebar', () => {
    const Thread = Object.assign((props: { order: string; limit: number }) => props, { blockName: 'Thread', custom: true })
    const Plan = Object.assign(() => null, { blockName: 'Plan', custom: true })
    const model = view<typeof article>('article')
      .layout((r) => [l.custom(Plan), l.section('Content', [r.title]), l.custom(Thread, { title: 'Comments', props: { order: r.createdAt, limit: 20 }, sidebar: true })])
      .toModel()
    expect(model.layout).toEqual([
      { kind: 'custom', component: 'Plan' },
      { kind: 'section', title: 'Content', fields: ['title'] },
      { kind: 'custom', component: 'Thread', title: 'Comments', props: { order: { $field: 'createdAt' }, limit: 20 }, sidebar: true },
    ])
    const Card = Object.assign(() => null, { blockName: 'Card', custom: false })
    expect(() => view<typeof article>('article').layout(() => [l.custom(Card)])).toThrow('l.custom takes a component declared with component(...), not the built-in block Card')
  })

  it('carries a suffix, an icon, value colours and a badge shape as field hints', () => {
    const hinted = view<typeof article>('article')
      .fields((r) => ({ price: r.price.suffix(' per month').icon('ruler'), status: r.status.valueColors({ draft: '#999' }).valueColors({ live: '#00a651' }).badgeShape('arrow') }))
      .toModel()
    expect(hinted.fields).toEqual({ price: { suffix: ' per month', icon: 'ruler' }, status: { valueColors: { draft: '#999', live: '#00a651' }, badgeShape: 'arrow' } })
  })

  it('refuses a value colour that is not a hex colour', () => {
    expect(() => view<typeof article>('article').fields((r) => ({ status: r.status.valueColors({ live: 'green' }) }))).toThrow('Field "status": value colour "green" of "live" is not a hex colour such as #00a651')
  })

  it("shows boolean fields as a card's flags, and refuses any other field there", () => {
    const flagged = view<typeof article>('article').list((r, d) => ({ columns: [r.title], displays: [d.cards({ flags: [r.featured] })] })).toModel(article.toModel())
    expect(flagged.list?.displays).toEqual([{ kind: 'cards', name: 'cards', flags: ['featured'] }])
    const wrong = view<typeof article>('article').list((r, d) => ({ columns: [r.title], displays: [d.cards({ flags: [r.featured, r.title] })] }))
    expect(() => wrong.toModel(article.toModel())).toThrow('View "article": display "cards" shows "title" as a flag, which is not a boolean field')
  })

  it('puts a map of the record position in the record layout, in the main column or the sidebar', () => {
    const shop = resource('shop').table('shops').fields({ id: f.integer(), lat: f.decimal({ precision: 8, scale: 6 }), lng: f.decimal({ precision: 9, scale: 6 }) }).primaryKey((r) => r.id)
    const model = view<typeof shop>('shop')
      .layout((r) => [l.map('Location', { latitude: r.lat, longitude: r.lng }), l.map('Nearby', { latitude: r.lat, longitude: r.lng, zoom: 12, sidebar: true })])
      .toModel()
    expect(model.layout).toEqual([
      { kind: 'map', title: 'Location', latitude: 'lat', longitude: 'lng' },
      { kind: 'map', title: 'Nearby', latitude: 'lat', longitude: 'lng', zoom: 12, sidebar: true },
    ])
  })

  it('refuses display fields the resource does not have', () => {
    const stale = view<typeof article>('article').list((r, d) => ({ columns: [r.title], displays: [d.cards({ badge: { name: 'state' } })] }))
    expect(() => stale.toModel(article.toModel())).toThrow('View "article": display "cards" names field "state", which the resource does not have')
  })

  it("shows a file field as a card's image, and refuses any other field there", () => {
    const pictured = resource('article').table('articles').fields({ id: f.integer(), title: f.text(), cover: f.file().accept(['image/*']) }).primaryKey((r) => r.id)
    const cards = view<typeof pictured>('article').list((r, d) => ({ columns: [r.title], displays: [d.cards({ image: r.cover })] })).toModel(pictured.toModel())
    expect(cards.list?.displays).toEqual([{ kind: 'cards', name: 'cards', image: 'cover' }])
    const titled = view<typeof pictured>('article').list((r, d) => ({ columns: [r.title], displays: [d.cards({ image: r.title })] }))
    expect(() => titled.toModel(pictured.toModel())).toThrow('View "article": display "cards" shows "title" as its image, which is not a file field')
  })

  it('refuses a path in the app as a link href, pointing at to', () => {
    expect(() => view<typeof article>('article').actions((a) => [a.link('mine', { label: 'Mine', href: '/article?filter=owner%20%3D%20me' })])).toThrow(
      'Action "mine": href "/article?filter=owner%20%3D%20me" points inside the app; give the link `to` instead',
    )
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
