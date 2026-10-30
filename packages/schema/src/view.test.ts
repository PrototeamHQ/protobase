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

  it('lets an update ask for inputs and write the answers, and refuses a placeholder naming none', () => {
    const [answer] = view<typeof article>('article')
      .actions((a) => [a.update('answer', { label: 'Answer', inputs: (i) => [i.text('answer', { label: 'Answer', multiline: true })], set: { status: 'answered', title: '{answer}' } })])
      .toModel().actions
    expect(answer!.inputs).toHaveLength(1)
    expect(answer!.run).toEqual({ kind: 'update', values: { status: 'answered', title: '{answer}' } })
    const build = (set: Record<string, unknown>, twice = false) => () => view<typeof article>('article').actions((a) => [a.update('answer', { label: 'Answer', inputs: (i) => [i.text('answer', { label: 'Answer' }), ...(twice ? [i.text('answer', { label: 'Answer' })] : [])], set })])
    expect(build({ title: '{answer}' }, true)).toThrow('Action "answer": ')
    expect(build({ title: '{nope}' })).toThrow('Action "answer": set "title" names input "nope", which it does not ask for')
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

  it('adds a board by a filterable enum, and refuses one by another field', () => {
    const task = resource('task')
      .table('tasks')
      .fields({ id: f.integer(), title: f.text(), stage: f.enum(['todo', 'doing', 'done']).filterable(), kind: f.enum(['bug', 'feature']), due: f.date() })
      .primaryKey((r) => r.id)
    const board = (by: 'stage' | 'kind' | 'title') =>
      view<typeof task>('task')
        .list((r, d) => ({ columns: [r.title], displays: [d.board({ by: r[by], title: r.title, meta: [r.due] }, { label: 'Stages' })], default: 'board' }))
        .toModel(task.toModel())
    expect(board('stage').list?.displays).toEqual([{ kind: 'board', name: 'board', label: 'Stages', by: 'stage', title: 'title', meta: ['due'] }])
    expect(() => board('kind')).toThrow('View "task": display "board": "kind" on task is not filterable, and each column of the board filters by its value')
    expect(() => board('title')).toThrow('View "task": display "board": "title" on task is text, not an enum, whose values are the board\'s columns')
  })

  it('adds a calendar by a filterable date, and refuses one by another type, an unfilterable field or an end of another type', () => {
    const task = resource('task')
      .table('tasks')
      .fields({
        id: f.integer(),
        title: f.text(),
        stage: f.enum(['todo', 'doing', 'done']).filterable(),
        due: f.date().filterable(),
        ends: f.date().filterable(),
        planned: f.date(),
        at: f.timestamp().filterable(),
      })
      .primaryKey((r) => r.id)
    const calendar = (start: 'due' | 'stage' | 'planned', end?: 'ends' | 'at' | 'planned') =>
      view<typeof task>('task')
        .list((r, d) => ({ columns: [r.title], displays: [d.calendar({ start: r[start], ...(end && { end: r[end] }), title: r.title }, { label: 'Due' })] }))
        .toModel(task.toModel())
    expect(calendar('due', 'ends').list?.displays).toEqual([{ kind: 'calendar', name: 'calendar', label: 'Due', start: 'due', end: 'ends', title: 'title' }])
    expect(() => calendar('stage')).toThrow('View "task": display "calendar": start "stage" on task is enum, not a date or timestamp')
    expect(() => calendar('planned')).toThrow('View "task": display "calendar": start "planned" on task is not filterable, and the calendar filters by it for the days it shows')
    expect(() => calendar('due', 'planned')).toThrow('View "task": display "calendar": end "planned" on task is not filterable, and the calendar filters by it for the days it shows')
    expect(() => calendar('due', 'at')).toThrow('View "task": display "calendar": end "at" on task is timestamp, not date like start "due"')
  })

  it('adds a timeline by filterable dates in lanes of a field, and refuses one by an unfilterable or other date', () => {
    const task = resource('task')
      .table('tasks')
      .fields({ id: f.integer(), title: f.text(), stage: f.enum(['todo', 'doing', 'done']), starts: f.date().filterable(), ends: f.date().filterable(), planned: f.date(), at: f.timestamp().filterable() })
      .primaryKey((r) => r.id)
    const timeline = (start: 'starts' | 'planned' | 'stage', end?: 'ends' | 'at') =>
      view<typeof task>('task')
        .list((r, d) => ({ columns: [r.title], displays: [d.timeline({ start: r[start], ...(end && { end: r[end] }), group: r.stage }, { name: 'plan' })] }))
        .toModel(task.toModel())
    expect(timeline('starts', 'ends').list?.displays).toEqual([{ kind: 'timeline', name: 'plan', start: 'starts', end: 'ends', group: 'stage' }])
    expect(() => timeline('stage')).toThrow('View "task": display "plan": start "stage" on task is enum, not a date or timestamp')
    expect(() => timeline('planned')).toThrow('View "task": display "plan": start "planned" on task is not filterable, and the timeline filters by it for the days it shows')
    expect(() => timeline('starts', 'at')).toThrow('View "task": display "plan": end "at" on task is timestamp, not date like start "starts"')
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

  it('draws the whole record page with a component of the project or a plugin, given by its name', () => {
    const ChannelChat = Object.assign(() => null, { blockName: 'ChannelChat', custom: true })
    expect(view<typeof article>('article').record({ component: ChannelChat }).toModel(article.toModel()).record).toEqual({ component: 'ChannelChat' })
    const Built = Object.assign(() => null, { blockName: 'Card', custom: false })
    expect(() => view<typeof article>('article').record({ component: Built })).toThrow('record component takes a component declared with component(...), not the built-in block Card')
  })

  it("names where a card's further photos come from, as data the caller's photos cannot change", () => {
    const photos = { resource: 'article_photos', field: 'article_id', image: 'photo', sort: 'position' }
    const model = view<typeof article>('article')
      .list((r, d) => ({ columns: [r.title], displays: [d.cards({ title: r.title }, { photos })] }))
      .toModel(article.toModel())
    photos.sort = 'id'
    expect(model.list?.displays).toEqual([{ kind: 'cards', name: 'cards', title: 'title', photos: { resource: 'article_photos', field: 'article_id', image: 'photo', sort: 'position' } }])
  })

  it("names where a card's favorite button saves its record, as data the caller cannot change", () => {
    const favorite = { resource: 'saved_articles', field: 'article_id', label: 'Save' }
    const model = view<typeof article>('article')
      .list((r, d) => ({ columns: [r.title], displays: [d.cards({ title: r.title }, { favorite })] }))
      .toModel(article.toModel())
    favorite.label = 'Keep'
    expect(model.list?.displays).toEqual([{ kind: 'cards', name: 'cards', title: 'title', favorite: { resource: 'saved_articles', field: 'article_id', label: 'Save' } }])
  })

  it('lists the records a relation points at, and refuses a field that is no relation', () => {
    const saved = resource('saved_articles')
      .table('saved_articles')
      .fields({ id: f.integer(), user_id: f.text(), article_id: f.relation('article').filterable() })
      .primaryKey((r) => r.id)
      .owner((r) => r.user_id)
    expect(view<typeof saved>('saved_articles').listOf((r) => r.article_id).toModel(saved.toModel()).listOf).toBe('article_id')
    expect(() => view<typeof saved>('saved_articles').listOf((r) => r.user_id).toModel(saved.toModel())).toThrow('listOf names "user_id", which is not a relation field')
  })

  it('saves a list\'s filter as a search of the user\'s own, under a label of its own', () => {
    const search = { resource: 'saved_searches', label: 'Keep this search' }
    const model = view<typeof article>('article').saveSearch(search).toModel(article.toModel())
    search.label = 'Save'
    expect(model.saveSearch).toEqual({ resource: 'saved_searches', label: 'Keep this search' })
  })

  it('names the page that creates its records', () => {
    expect(view<typeof article>('article').toModel().create).toBeUndefined()
    expect(view<typeof article>('article').create({ page: 'new-article' }).toModel().create).toEqual({ page: 'new-article' })
  })

  it('takes Export off a list or limits its rows, and refuses a limit that is no positive whole number', () => {
    expect(view<typeof article>('article').toModel().export).toBeUndefined()
    expect(view<typeof article>('article').export(false).toModel().export).toBe(false)
    expect(view<typeof article>('article').export({ maxRows: 10_000 }).toModel().export).toEqual({ maxRows: 10_000 })
    expect(() => view<typeof article>('article').export({ maxRows: 0 })).toThrow('export maxRows must be a positive whole number')
    expect(() => view<typeof article>('article').export({ maxRows: 2.5 })).toThrow('export maxRows must be a positive whole number')
  })

  it('names the fields of a saved search, and refuses ones of the wrong type', () => {
    const searches = resource('saved_searches')
      .table('saved_searches')
      .fields({ id: f.integer(), user_id: f.text(), name: f.text(), filter: f.text(), frequency: f.enum(['instant', 'daily']), seen_at: f.timestamp(), count: f.integer() })
      .primaryKey((r) => r.id)
      .owner((r) => r.user_id)
    const model = searches.toModel()
    const of = view<typeof searches>('saved_searches').searchesOf((r) => ({ resource: 'article', filter: r.filter, name: r.name, controls: [r.frequency], unseen: { seenAt: r.seen_at, field: 'createdAt' }, limit: 6 }))
    expect(of.toModel(model).searchesOf).toEqual({ resource: 'article', filter: 'filter', name: 'name', controls: ['frequency'], unseen: { seenAt: 'seen_at', field: 'createdAt' }, limit: 6 })
    expect(view<typeof searches>('saved_searches').searchesOf((r) => ({ resource: 'article', filter: r.filter })).toModel(model).searchesOf).toEqual({ resource: 'article', filter: 'filter' })
    expect(() => view<typeof searches>('saved_searches').searchesOf((r) => ({ resource: 'article', filter: r.count })).toModel(model)).toThrow('View "saved_searches": searchesOf filter "count" is not a text field of the resource')
    expect(() => view<typeof searches>('saved_searches').searchesOf((r) => ({ resource: 'article', filter: r.filter, unseen: { seenAt: r.name, field: 'createdAt' } })).toModel(model)).toThrow(
      'unseen.seenAt "name" is not a timestamp field',
    )
    expect(() => view<typeof searches>('saved_searches').searchesOf((r) => ({ resource: 'article', filter: r.filter, limit: 0 })).toModel(model)).toThrow('limit must be a positive whole number')
    expect(() => view<typeof searches>('saved_searches').searchesOf((r) => ({ resource: 'article', filter: r.filter, controls: [r.count] })).toModel(model)).toThrow('control "count" is not an enum or boolean field')
  })

  it('tells visitors what signing in gives, with a sign-up page only at an address outside the app', () => {
    const prompt = { title: 'Keep articles', description: 'Sign in to save them.', benefits: ['Read them later'], signUp: { label: 'Create an account', href: 'https://example.com/join' } }
    const model = view<typeof article>('article').signIn(prompt).toModel()
    prompt.benefits.push('Share them')
    expect(model.signIn).toEqual({ title: 'Keep articles', description: 'Sign in to save them.', benefits: ['Read them later'], signUp: { label: 'Create an account', href: 'https://example.com/join' } })
    expect(() => view<typeof article>('article').signIn({ ...prompt, signUp: { label: 'Join', href: '/join' } })).toThrow('signUp.href must start with')
  })

  it('adds a map of the records at their position, with the card of a cards display it names', () => {
    const shops = resource('shops').table('shops').fields({ id: f.integer(), name: f.text(), lat: f.decimal({ precision: 8, scale: 6 }), lng: f.decimal({ precision: 9, scale: 6 }) }).primaryKey((r) => r.id)
    const model = view<typeof shops>('shops')
      .list((r, d) => ({ columns: [r.name], displays: [d.cards({ title: r.name }, { name: 'tiles' }), d.map({ latitude: r.lat, longitude: r.lng }, { label: 'On the map', cards: 'tiles' })] }))
      .toModel(shops.toModel())
    expect(model.list?.displays?.[1]).toEqual({ kind: 'map', name: 'map', label: 'On the map', latitude: 'lat', longitude: 'lng', cards: 'tiles' })
    expect(displayFields(model.list!.displays![1]!)).toEqual(['lat', 'lng'])
    const unknown = () => view<typeof shops>('shops').list((r, d) => ({ columns: [r.name], displays: [d.map({ latitude: r.lat, longitude: r.lng }, { cards: 'tiles' })] }))
    expect(unknown).toThrow('display "map" names cards "tiles", which is not a cards display of the list')
  })

  it('marks the map\'s approximate positions by a field, with the area around them', () => {
    const homes = resource('homes')
      .table('homes')
      .fields({ id: f.integer(), lat: f.decimal({ precision: 8, scale: 6 }), lng: f.decimal({ precision: 9, scale: 6 }), exact: f.boolean(), accuracy: f.integer().optional(), outline: f.json().optional() })
      .primaryKey((r) => r.id)
    const map = (pick: (r: Parameters<Parameters<ReturnType<typeof view<typeof homes>>['list']>[0]>[0], d: typeof displays) => ListDisplayModel) => () =>
      view<typeof homes>('homes').list((r, d) => ({ columns: [r.id], displays: [pick(r, d)] })).toModel(homes.toModel())
    const model = map((r, d) => d.map({ latitude: r.lat, longitude: r.lng, exact: r.exact, radius: r.accuracy, area: r.outline }, { defaultRadius: 250 }))()
    expect(model.list?.displays?.[0]).toEqual({ kind: 'map', name: 'map', latitude: 'lat', longitude: 'lng', exact: 'exact', radius: 'accuracy', defaultRadius: 250, area: 'outline' })
    expect(displayFields(model.list!.displays![0]!)).toEqual(['lat', 'lng', 'exact', 'accuracy', 'outline'])
    expect(map((r, d) => d.map({ latitude: r.lat, longitude: r.lng, radius: r.accuracy }))).toThrow('display "map": an area around approximate positions needs the approximate or exact field')
    expect(map((r, d) => d.map({ latitude: r.lat, longitude: r.lng, approximate: r.exact, exact: r.exact }))).toThrow('display "map": name approximate or exact, not both')
    expect(map((r, d) => d.map({ latitude: r.lat, longitude: r.lng, exact: r.exact }, { defaultRadius: 0 }))).toThrow('display "map": defaultRadius 0 is not a number of metres above 0')
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

  it('puts the record history and the comments in the record layout, under titles of their own', () => {
    const model = view<typeof article>('article')
      .layout((r) => [l.section('Content', [r.title]), l.history(), l.comments(), l.comments('Notes', { when: 'reading' })])
      .toModel()
    expect(model.layout.slice(1)).toEqual([
      { kind: 'history', title: 'History' },
      { kind: 'comments', title: 'Comments' },
      { kind: 'comments', title: 'Notes', when: 'reading' },
    ])
  })

  it('carries a suffix, an icon, value colours and a badge shape as field hints', () => {
    const hinted = view<typeof article>('article')
      .fields((r) => ({ price: r.price.suffix(' per month').icon('ruler'), status: r.status.valueColors({ draft: '#999' }).valueColors({ live: '#00a651' }).badgeShape('arrow') }))
      .toModel()
    expect(hinted.fields).toEqual({ price: { suffix: ' per month', icon: 'ruler' }, status: { valueColors: { draft: '#999', live: '#00a651' }, badgeShape: 'arrow' } })
  })

  it('carries the question a change asks as a field hint, and refuses an empty one', () => {
    const hinted = view<typeof article>('article').fields((r) => ({ featured: r.featured.confirm('Feature this article on the home page?') })).toModel()
    expect(hinted.fields).toEqual({ featured: { confirm: 'Feature this article on the home page?' } })
    expect(() => view<typeof article>('article').fields((r) => ({ featured: r.featured.confirm(' ') }))).toThrow('Field "featured": .confirm() needs the question to ask')
  })

  it('carries multiline as a field hint', () => {
    const hinted = view<typeof article>('article').fields((r) => ({ title: r.title.multiline().label('Body') })).toModel()
    expect(hinted.fields).toEqual({ title: { multiline: true, label: 'Body' } })
  })

  it('carries markdown as a field hint', () => {
    const hinted = view<typeof article>('article').fields((r) => ({ title: r.title.markdown() })).toModel()
    expect(hinted.fields).toEqual({ title: { markdown: true } })
  })

  it('takes a tone or a hex colour per value, and refuses anything else', () => {
    const toned = view<typeof article>('article').fields((r) => ({ status: r.status.valueColors({ draft: 'neutral', live: 'green' }).valueColors({ live: '#00a651' }) })).toModel()
    expect(toned.fields).toEqual({ status: { valueColors: { draft: 'neutral', live: '#00a651' } } })
    expect(() => view<typeof article>('article').fields((r) => ({ status: r.status.valueColors({ live: 'lime' }) }))).toThrow(
      'Field "status": value colour "lime" of "live" is not a tone (neutral, blue, green, amber, red, violet) or a hex colour such as #00a651',
    )
  })

  it('carries an ISO 4217 currency as a field hint, and refuses anything else', () => {
    expect(view<typeof article>('article').fields((r) => ({ price: r.price.currency('EUR').decimals(2) })).toModel().fields).toEqual({ price: { currency: 'EUR', decimals: 2 } })
    for (const wrong of ['eur', '€', 'EURO']) {
      expect(() => view<typeof article>('article').fields((r) => ({ price: r.price.currency(wrong) }))).toThrow(`Field "price": currency "${wrong}" is not an ISO 4217 code such as EUR`)
    }
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

  it('puts a chart of related records in the record layout, and refuses one without a series', () => {
    const host = resource('host').table('hosts').fields({ id: f.integer() }).primaryKey((r) => r.id)
    const samples = { resource: 'host_samples', field: 'host_id', at: 'sampled_at' }
    const model = view<typeof host>('host')
      .layout(() => [l.chart('Usage', { ...samples, series: ['cpu', 'memory'] }), l.chart('Disk', { ...samples, series: ['disk_read'], range: '24h', help: 'Bytes per second.', when: 'reading' })])
      .toModel()
    expect(model.layout).toEqual([
      { kind: 'chart', title: 'Usage', ...samples, series: ['cpu', 'memory'] },
      { kind: 'chart', title: 'Disk', ...samples, series: ['disk_read'], range: '24h', help: 'Bytes per second.', when: 'reading' },
    ])
    expect(() => l.chart('Usage', { ...samples, series: [] })).toThrow('l.chart "Usage" needs at least one series')
  })

  it('puts sections and related tables in a group, refuses other items, and refuses two groups with one title', () => {
    const home = resource('home').table('homes').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
    const related = { resource: 'notes', field: 'home_id' }
    const model = view<typeof home>('home').layout((r) => [l.group('More', [l.section('Details', [r.title]), l.related('Notes', related)], { collapsed: true })]).toModel(home.toModel())
    expect(model.layout).toEqual([
      { kind: 'group', title: 'More', collapsed: true, items: [{ kind: 'section', title: 'Details', fields: ['title'] }, { kind: 'related', title: 'Notes', ...related }] },
    ])
    expect(() => l.group('More', [l.sidebar([])])).toThrow('l.group "More" holds sections and related tables, not sidebar')
    const twice = view<typeof home>('home').layout(() => [l.group('More', []), l.group('More', [])])
    expect(() => twice.toModel(home.toModel())).toThrow('View "home": two groups are titled "More"')
  })

  it('puts main-column items in a tab, refuses sidebar items and nested tabs, and refuses tabs apart, one title twice, and one group title twice', () => {
    const home = resource('home').table('homes').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
    const related = { resource: 'notes', field: 'home_id' }
    const model = view<typeof home>('home')
      .layout((r) => [l.tab('Main', [l.section('Details', [r.title]), l.group('More', [l.related('Notes', related)]), l.history('Changes')])])
      .toModel(home.toModel())
    expect(model.layout).toEqual([
      {
        kind: 'tab',
        title: 'Main',
        items: [
          { kind: 'section', title: 'Details', fields: ['title'] },
          { kind: 'group', title: 'More', items: [{ kind: 'related', title: 'Notes', ...related }] },
          { kind: 'history', title: 'Changes' },
        ],
      },
    ])
    expect(() => l.tab('A', [l.sidebar([])])).toThrow('l.tab "A" holds main-column items, not sidebar')
    expect(() => l.tab('A', [l.tab('B', [])])).toThrow('l.tab "A" holds main-column items, not tab')
    expect(() => l.tab('A', [l.map('Where', { latitude: {} as never, longitude: {} as never, sidebar: true })])).toThrow('not a sidebar map')
    const apart = view<typeof home>('home').layout(() => [l.tab('A', []), l.section('S', []), l.tab('B', [])])
    expect(() => apart.toModel(home.toModel())).toThrow('View "home": tabs stand together, and "B" is apart from the others')
    const twice = view<typeof home>('home').layout(() => [l.tab('A', []), l.tab('A', [])])
    expect(() => twice.toModel(home.toModel())).toThrow('View "home": two tabs are titled "A"')
    const groups = view<typeof home>('home').layout(() => [l.tab('A', [l.group('More', [])]), l.tab('B', [l.group('More', [])])])
    expect(() => groups.toModel(home.toModel())).toThrow('View "home": two groups are titled "More"')
  })

  it('puts a gallery of the record and its photo records in the record layout, and refuses one without photos', () => {
    const home = resource('home').table('homes').fields({ id: f.integer(), title: f.text(), cover: f.file().accept(['image/*']) }).primaryKey((r) => r.id)
    const photos = { resource: 'home_photos', field: 'home_id', image: 'photo', sort: 'position' }
    const model = view<typeof home>('home').layout((r) => [l.gallery('Photos', { image: r.cover, photos }), l.gallery('Cover', { image: r.cover })]).toModel(home.toModel())
    expect(model.layout).toEqual([
      { kind: 'gallery', title: 'Photos', image: 'cover', photos },
      { kind: 'gallery', title: 'Cover', image: 'cover' },
    ])
    expect(() => l.gallery('Photos', {})).toThrow('l.gallery "Photos" needs an image field, photos or both')
    const titled = view<typeof home>('home').layout((r) => [l.gallery('Photos', { image: r.title })])
    expect(() => titled.toModel(home.toModel())).toThrow('View "home": gallery "Photos" shows "title" as its image, which is not a file field')
  })

  it('shows a section as key facts, each under its icon', () => {
    const model = view<typeof article>('article')
      .fields((r) => ({ price: r.price.icon('wallet') }))
      .layout((r) => [l.section('Key facts', [r.price, r.title], { presentation: 'facts' })])
      .toModel()
    expect(model.layout).toEqual([{ kind: 'section', title: 'Key facts', fields: ['price', 'title'], presentation: 'facts' }])
    expect(model.fields.price).toEqual({ icon: 'wallet' })
  })

  it('shows layout items and fields only on the form or the read view when they say so', () => {
    const model = view<typeof article>('article')
      .fields((r) => ({ price: r.price.when('editing') }))
      .layout((r) => [l.section('Content', [r.title], { when: 'reading' }), l.sidebar([r.price], { when: 'editing' }), l.related('Notes', { resource: 'notes', field: 'article_id', when: 'editing' })])
      .toModel()
    expect(model.fields.price).toEqual({ when: 'editing' })
    expect(model.layout).toEqual([
      { kind: 'section', title: 'Content', fields: ['title'], when: 'reading' },
      { kind: 'sidebar', fields: ['price'], when: 'editing' },
      { kind: 'related', title: 'Notes', resource: 'notes', field: 'article_id', when: 'editing' },
    ])
  })

  it('keeps a record condition and hideEmpty as given', () => {
    const model = view<typeof article>('article')
      .layout((r) => [l.section('Done', [r.title], { when: 'status = "done"' }), l.related('Notes', { resource: 'notes', field: 'article_id', hideEmpty: true })])
      .toModel()
    expect(model.layout).toEqual([
      { kind: 'section', title: 'Done', fields: ['title'], when: 'status = "done"' },
      { kind: 'related', title: 'Notes', resource: 'notes', field: 'article_id', hideEmpty: true },
    ])
  })

  it('opens the record page as a read view or locked, and shows help only while editing', () => {
    const model = view<typeof article>('article')
      .recordMode('read')
      .helpWhen('editing')
      .fields((r) => ({ title: r.title.help('Shown in lists', { when: 'always' }), price: r.price.help('Without VAT') }))
      .layout((r) => [l.section('Content', [r.title], { help: 'Main fields', helpWhen: 'always' })])
      .toModel()
    expect(model).toMatchObject({ recordMode: 'read', helpWhen: 'editing', fields: { title: { help: 'Shown in lists', helpWhen: 'always' }, price: { help: 'Without VAT' } } })
    expect(model.layout).toEqual([{ kind: 'section', title: 'Content', fields: ['title'], help: 'Main fields', helpWhen: 'always' }])
    expect(view<typeof article>('article').recordMode('locked').toModel().recordMode).toBe('locked')
  })

  it('offers Import on the list page unless turned off', () => {
    expect(view<typeof article>('article').toModel().import).toBeUndefined()
    expect(view<typeof article>('article').import(false).toModel().import).toBe(false)
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

  it('describes an AI action and refuses one without a field to read or write', () => {
    const model = view<typeof article>('article')
      .actions((a) => [a.ai('summarise', { label: 'Summarise', icon: 'file-text', prompt: 'Sum up {title}', writes: 'title', confirm: 'Replace it?' })])
      .toModel()
    expect(model.actions).toEqual([
      { name: 'summarise', label: 'Summarise', bulk: false, icon: 'file-text', confirm: 'Replace it?', run: { kind: 'ai', prompt: 'Sum up {title}', writes: 'title' } },
    ])
    expect(() => view<typeof article>('article').actions((a) => [a.ai('x', { label: 'X', prompt: 'Sum up', writes: 'title' })])).toThrow(
      'Action "x": its prompt must name at least one {field} of the record',
    )
    expect(() => view<typeof article>('article').actions((a) => [a.ai('x', { label: 'X', prompt: '{title}', writes: '' })])).toThrow('Action "x": it writes no field')
  })

  it('refuses a path in the app as a link href, pointing at to', () => {
    expect(() => view<typeof article>('article').actions((a) => [a.link('mine', { label: 'Mine', href: '/article?filter=owner%20%3D%20me' })])).toThrow(
      'Action "mine": href "/article?filter=owner%20%3D%20me" points inside the app; give the link `to` instead',
    )
  })

  it("opens the URL a field holds from an href that is only the field, and names its host in the label", () => {
    const linked = view<typeof article>('article').actions((a) => [a.link('source', { label: 'View on {host}', icon: 'external-link', href: '{title}' })]).toModel()
    expect(linked.actions).toEqual([{ name: 'source', label: 'View on {host}', icon: 'external-link', bulk: false, run: { kind: 'link', href: '{title}' } }])
    expect(() => view<typeof article>('article').actions((a) => [a.link('mine', { label: 'Mine on {host}', to: { kind: 'list', resource: 'article' } })])).toThrow(
      'Action "mine": the label names {host}, which only a link with an href has',
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

  it('a title derived by a named rule from the fields it reads', () => {
    expect(view<typeof article>('article').titleFrom('headline', (r) => [r.title, r.status]).toModel(article.toModel()).titleFrom).toEqual({ rule: 'headline', fields: ['title', 'status'] })
    const other = resource('other').table('o').fields({ id: f.integer() }).primaryKey((r) => r.id).toModel()
    expect(() => view<typeof article>('article').titleFrom('headline', (r) => [r.title]).toModel(other)).toThrow('titleFrom field "title" does not exist')
    expect(() => view<typeof article>('article').titleFrom('', (r) => [r.title])).toThrow('titleFrom needs the name of a rule')
    expect(() => view<typeof article>('article').titleFrom('headline', () => [])).toThrow('titleFrom "headline" reads no fields')
  })

  it('search result title of several fields and a subtitle', () => {
    const build = (v = view<typeof article>('article')) => v.searchResult((r) => ({ title: [r.title, r.status], subtitle: r.price }))
    expect(build().toModel(article.toModel()).searchResult).toEqual({ title: ['title', 'status'], subtitle: 'price' })
    expect(view<typeof article>('article').searchResult((r) => ({ title: r.title })).toModel().searchResult).toEqual({ title: ['title'] })
    const other = resource('other').table('o').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id).toModel()
    expect(() => build().toModel(other)).toThrow('search result field "status" does not exist')
  })

  it('keeps the filter a list opens with, and leaves out an empty one', () => {
    expect(view<typeof article>('article').list((r) => ({ columns: [r.id], filter: 'id > 1' })).toModel().list?.filter).toBe('id > 1')
    expect(view<typeof article>('article').list((r) => ({ columns: [r.id], filter: '' })).toModel().list).not.toHaveProperty('filter')
  })

  it('lets a list drag only what its drag turns on', () => {
    expect(view<typeof article>('article').list((r) => ({ columns: [r.id], drag: { board: true } })).toModel().list?.drag).toEqual({ board: true })
    expect(view<typeof article>('article').list((r) => ({ columns: [r.id] })).toModel().list).not.toHaveProperty('drag')
  })

  describe('named lists', () => {
    const base = () => view<typeof article>('article').names({ singular: 'Article', plural: 'Articles' })
    const updates = (v: ReturnType<typeof base>) => v.names({ singular: 'Update', plural: 'Updates' })

    it('carries the named list with its parts', () => {
      const model = base()
        .namedList('updates', (v) =>
          updates(v)
            .nav({ order: 2 })
            .help('Recent')
            .list((r) => ({ columns: [r.title] }))
            .filters((r, w) => [w.toggle(r.featured)])
            .chart((r) => ({ field: r.createdAt, range: '30d', granularity: 'day' })),
        )
        .toModel()
      expect(model.lists).toEqual([
        {
          name: 'updates',
          names: { singular: 'Update', plural: 'Updates' },
          nav: { order: 2 },
          help: 'Recent',
          list: { columns: ['title'] },
          filters: [{ kind: 'toggle', field: 'featured' }],
          chart: { field: 'createdAt', range: '30d', granularity: 'day' },
        },
      ])
    })

    it('throws on a name that does not fit an address', () => {
      expect(() => base().namedList('Up dates', updates)).toThrow('lowercase letters')
    })

    it('throws on a repeated name', () => {
      expect(() => base().namedList('updates', updates).namedList('updates', updates)).toThrow('declared twice')
    })

    it('throws without names', () => {
      expect(() => base().namedList('updates', (v) => v)).toThrow('needs .names')
    })

    it('throws on recent records', () => {
      expect(() => base().namedList('updates', (v) => updates(v).nav({ recent: { status: 'status', tones: {} } }))).toThrow('recent records')
    })

    it('throws on a part that is not a list part', () => {
      expect(() => base().namedList('updates', (v) => updates(v).layout((r) => [l.section('A', [r.title])]))).toThrow('sets layout')
    })

    it('throws with listOf', () => {
      expect(() => base().namedList('updates', updates).listOf((r) => r.id).toModel()).toThrow('named lists cannot go with listOf')
    })

    it('checks a named list display against the resource', () => {
      const stale = base().namedList('updates', (v) => updates(v).list((r, d) => ({ columns: [r.title], displays: [d.cards({ badge: { name: 'state' } })] })))
      expect(() => stale.toModel(article.toModel())).toThrow('display "cards" names field "state"')
    })
  })
})
