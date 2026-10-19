import { describe, expect, it } from 'vitest'
import { f, l, resource, restrictModel, view, type ResourceModel } from '@protobase/schema'
import { pruneView } from './view-access'

const customers = resource('customers').table('customers').fields({ id: f.integer(), name: f.text().filterable() }).primaryKey((r) => r.id)
const repairs = resource('repairs')
  .table('repairs')
  .fields({
    id: f.integer(),
    number: f.text().filterable().sortable(),
    customerId: f.relation('customers').filterable(),
    estimate: f.decimal({ precision: 8, scale: 2 }),
    costPrice: f.decimal({ precision: 8, scale: 2 }).filterable().sortable(),
    status: f.enum(['booked', 'ready']).filterable(),
    bookedOn: f.timestamp().sortable(),
    urgent: f.boolean().filterable(),
    insured: f.boolean(),
    paid: f.boolean().filterable(),
  })
  .primaryKey((r) => r.id)

const repairPhotos = resource('repair_photos')
  .table('repair_photos')
  .fields({ id: f.integer(), repairId: f.relation('repairs').filterable(), position: f.integer().sortable(), photo: f.file() })
  .primaryKey((r) => r.id)

const customerRepairs = resource('customer_repairs')
  .table('customer_repairs')
  .fields({ id: f.integer(), customerId: f.relation('customers').filterable(), repairId: f.relation('repairs') })
  .primaryKey((r) => r.id)

const all = { customers: customers.toModel(), repairs: repairs.toModel(), repair_photos: repairPhotos.toModel(), customer_repairs: customerRepairs.toModel() }

// The models as a caller who cannot read `hidden` and cannot see the `gone` resources gets them, as `/meta` does.
const without = (hidden: Record<string, string[]>, gone: string[] = []): Record<string, ResourceModel> =>
  Object.fromEntries(
    Object.entries(all)
      .filter(([name]) => !gone.includes(name))
      .map(([name, model]) => {
        const readableFields = Object.keys(model.fields).filter((field) => !hidden[name]?.includes(field))
        return [name, restrictModel(model, { readableFields, writableFields: { create: readableFields, update: readableFields } })]
      }),
  )

describe('pruneView', () => {
  it('leaves out public forms, which have a route of their own, even for a caller who reads every field', () => {
    const repairsView = view<typeof repairs>('repairs').form((r) => ({ name: 'book', fields: [r.number], thanks: 'Booked.' })).toModel()
    expect(pruneView(repairsView, all.repairs, all)).not.toHaveProperty('forms')
  })

  it('narrows a flags filter to the fields the caller can read, and leaves it out with none', () => {
    const repairsView = view<typeof repairs>('repairs').filters((r, w) => [w.flags([r.paid, r.urgent], { label: 'Attention' })]).toModel()
    const filters = (hidden: string[]) => pruneView(repairsView, without({ repairs: hidden }).repairs!, without({ repairs: hidden })).filters
    expect(filters([])).toEqual([{ kind: 'flags', fields: ['paid', 'urgent'], label: 'Attention' }])
    expect(filters(['paid'])).toEqual([{ kind: 'flags', fields: ['urgent'], label: 'Attention' }])
    expect(filters(['paid', 'urgent'])).toEqual([])
  })

  it('leaves out links that read a hidden field or lead where the caller cannot go', () => {
    const repairsView = view<typeof repairs>('repairs')
      .actions((a) => [
        a.link('customer', { label: 'Customer', to: { kind: 'record', resource: 'customers', key: '{customerId}' } }),
        a.link('sameCustomer', { label: 'Same customer', to: { kind: 'list', resource: 'repairs', filter: 'customerId = {customerId}' } }),
        a.link('quote', { label: 'Quote', href: 'https://quotes.example/{estimate}' }),
      ])
      .toModel()
    const names = (models: Record<string, ResourceModel>) => pruneView(repairsView, models.repairs!, models).actions.map((action) => action.name)
    expect(names(all)).toEqual(['customer', 'sameCustomer', 'quote'])
    expect(names(without({ repairs: ['estimate'] }))).toEqual(['customer', 'sameCustomer'])
    expect(names(without({}, ['customers']))).toEqual(['sameCustomer', 'quote'])
    expect(names(without({ repairs: ['customerId'] }))).toEqual(['quote'])
  })

  it('keeps a create link with values beyond the fields only when the resource opens a create page', () => {
    const customersView = view<typeof customers>('customers')
      .actions((a) => [a.link('book', { label: 'Book a repair', to: { kind: 'create', resource: 'repairs', values: { owner_id: '{id}' } } })])
      .toModel()
    expect(pruneView(customersView, all.customers, all).actions).toEqual([])
    expect(pruneView(customersView, all.customers, all, new Set(), new Set(['repairs'])).actions.map((action) => action.name)).toEqual(['book'])
  })

  it('sends an AI action without its prompt, and leaves it out when the caller cannot read a field it reads or writes', () => {
    const repairsView = view<typeof repairs>('repairs')
      .actions((a) => [a.ai('triage', { label: 'Triage', prompt: 'How urgent is {number}? Cost {estimate}', writes: 'status' })])
      .toModel()
    const actions = (models: Record<string, ResourceModel>) => pruneView(repairsView, models.repairs!, models).actions
    expect(actions(all)).toEqual([{ name: 'triage', label: 'Triage', bulk: false, run: { kind: 'ai', writes: 'status' } }])
    expect(actions(without({ repairs: ['estimate'] }))).toEqual([])
    expect(actions(without({ repairs: ['status'] }))).toEqual([])
  })

  it('keeps an action with inputs whole, and leaves it out when a choice picks records the caller cannot see', () => {
    const repairsView = view<typeof repairs>('repairs')
      .actions((a) => [
        a.action('reassign', { label: 'Reassign', inputs: (i) => [i.choice('customer', { label: 'Customer', resource: 'customers' }), i.text('reason', { label: 'Reason' })] }),
        a.action('note', { label: 'Note', inputs: (i) => [i.text('text', { label: 'Text' })] }),
      ])
      .toModel()
    const actions = (models: Record<string, ResourceModel>) => pruneView(repairsView, models.repairs!, models).actions
    expect(actions(all)).toEqual(repairsView.actions)
    expect(actions(without({}, ['customers'])).map((action) => action.name)).toEqual(['note'])
  })

  it('keeps an update with inputs whole', () => {
    const repairsView = view<typeof repairs>('repairs')
      .actions((a) => [a.update('renumber', { label: 'Renumber', inputs: (i) => [i.text('number', { label: 'Number' })], set: { number: '{number}' } })])
      .toModel()
    expect(pruneView(repairsView, all.repairs, all).actions).toEqual(repairsView.actions)
  })

  it("keeps a link to a record's URL for any caller the view grants the field, and leaves it out for one it hides it from", () => {
    const repairsView = view<typeof repairs>('repairs')
      .actions((a) => [a.link('source', { label: 'View on {host}', href: '{number}' })])
      .toModel()
    const names = (models: Record<string, ResourceModel>) => pruneView(repairsView, models.repairs!, models).actions.map((action) => action.name)
    // A visitor who is not signed in reads only the number and the status, and gets the link all the same
    expect(names(without({ repairs: ['customerId', 'estimate', 'costPrice', 'bookedOn', 'urgent', 'insured', 'paid'] }, ['customers', 'repair_photos']))).toEqual(['source'])
    expect(names(without({ repairs: ['number'] }))).toEqual([])
  })

  it('leaves out a custom section whose props name a field the caller cannot read', () => {
    const Quote = Object.assign((props: { amount: string; currency: string }) => props, { blockName: 'Quote', custom: true })
    const repairsView = view<typeof repairs>('repairs').layout((r) => [l.custom(Quote, { props: { amount: r.estimate, currency: 'EUR' } }), l.section('Repair', [r.status, r.estimate])]).toModel()
    expect(pruneView(repairsView, all.repairs, all).layout).toEqual(repairsView.layout)
    const hidden = without({ repairs: ['estimate'] })
    expect(pruneView(repairsView, hidden.repairs!, hidden).layout).toEqual([{ kind: 'section', title: 'Repair', fields: ['status'] }])
  })

  it("leaves out a card's flags the caller cannot read", () => {
    const flagged = view<typeof repairs>('repairs').list((r, d) => ({ columns: [r.number], displays: [d.cards({ flags: [r.urgent, r.insured] })] })).toModel(repairs.toModel())
    const hidden = without({ repairs: ['insured'] })
    expect(pruneView(flagged, hidden.repairs!, hidden).list?.displays).toEqual([{ kind: 'cards', name: 'cards', flags: ['urgent'] }])
  })

  it("leaves out a card's amount and footer fields the caller cannot read", () => {
    const footed = view<typeof repairs>('repairs').list((r, d) => ({ columns: [r.number], displays: [d.cards({ amount: [r.costPrice, r.number], footer: [r.status, r.insured] })] })).toModel(repairs.toModel())
    const hidden = without({ repairs: ['costPrice', 'insured'] })
    expect(pruneView(footed, hidden.repairs!, hidden).list?.displays).toEqual([{ kind: 'cards', name: 'cards', amount: ['number'], footer: ['status'] }])
  })

  it("prunes a named list's columns, widgets and chart as the view's own", () => {
    const named = view<typeof repairs>('repairs')
      .namedList('costs', (v) =>
        v
          .names({ singular: 'Cost', plural: 'Costs' })
          .list((r) => ({ columns: [r.number, r.costPrice], sort: [[r.costPrice, 'desc']] }))
          .filters((r, w) => [w.range(r.costPrice), w.facets(r.status)])
          .chart((r) => ({ field: r.costPrice, range: '30d', granularity: 'day' })),
      )
      .toModel()
    const hidden = without({ repairs: ['costPrice'] })
    const [pruned] = pruneView(named, hidden.repairs!, hidden).lists!
    expect(JSON.stringify(pruned)).not.toContain('costPrice')
    expect(pruned).toMatchObject({ name: 'costs', list: { columns: ['number'] }, filters: [{ kind: 'facets', field: 'status' }] })
    expect(pruneView(named, all.repairs, all)).toEqual(named)
  })

  it('never sends a hidden field, wherever a view names it: lists, displays, sections and custom props', () => {
    const Board = Object.assign((props: { by: string; size: number }) => props, { blockName: 'Board', custom: true })
    const Margin = Object.assign((props: { cost: string }) => props, { blockName: 'Margin', custom: true })
    const everywhere = view<typeof repairs>('repairs')
      .title((r) => r.costPrice)
      .searchResult((r) => ({ title: [r.number, r.costPrice], subtitle: r.costPrice }))
      .nav({ recent: { status: 'costPrice', tones: {} } })
      .fields((r) => ({ costPrice: r.costPrice.label('Cost price'), number: r.number.label('Number') }))
      .list((r, d) => ({
        columns: [r.number, r.costPrice],
        sort: [[r.costPrice, 'desc'], [r.bookedOn, 'asc']],
        search: [r.number, r.costPrice],
        displays: [
          d.cards({ title: r.number, subtitle: r.costPrice, badge: r.status, meta: [r.costPrice, r.bookedOn] }),
          d.custom(Board, { name: 'board', label: 'Board', fields: [r.number, r.costPrice], props: { by: r.status, size: 3 } }),
          d.custom(Board, { name: 'costs', label: 'Costs', fields: [r.number], props: { by: r.costPrice, size: 3 } }),
        ],
        default: 'costs',
      }))
      .filters((r, w) => [w.range(r.costPrice), w.facets(r.status)])
      .chart((r) => ({ field: r.costPrice, range: '30d', granularity: 'day' }))
      .layout((r) => [
        l.section('Repair', [r.number, r.costPrice]),
        l.section('Money', [r.costPrice]),
        l.custom(Margin, { title: 'Margin', props: { cost: r.costPrice } }),
        l.custom(Board, { props: { by: r.status, size: 1 } }),
        l.sidebar([r.status, r.costPrice]),
      ])
      .actions((a) => [
        a.update('zero', { label: 'Zero', set: { costPrice: 0 } }),
        a.link('cheaper', { label: 'Cheaper', to: { kind: 'list', resource: 'repairs', filter: 'costPrice < {costPrice}' } }),
        a.link('quote', { label: 'Quote', href: 'https://quotes.example/{costPrice}' }),
        a.update('ready', { label: 'Ready', set: { status: 'ready' } }),
      ])
      .toModel()
    const hidden = without({ repairs: ['costPrice'] })
    const pruned = pruneView(everywhere, hidden.repairs!, hidden)
    expect(JSON.stringify(pruned)).not.toContain('costPrice')
    expect(pruned.list).toEqual({
      columns: ['number'],
      sort: [['bookedOn', 'asc']],
      search: ['number'],
      displays: [
        { kind: 'cards', name: 'cards', title: 'number', badge: 'status', meta: ['bookedOn'] },
        { kind: 'custom', name: 'board', label: 'Board', component: 'Board', fields: ['number'], props: { by: { $field: 'status' }, size: 3 } },
      ],
    })
    expect(pruned.layout.map((item) => (item.kind === 'custom' ? item.component : item.kind))).toEqual(['section', 'Board', 'sidebar'])
    expect(pruned.actions.map((action) => action.name)).toEqual(['ready'])
    expect(pruneView(everywhere, all.repairs, all)).toEqual(everywhere)
  })

  it("keeps a cards display's photos only for a caller who can list them", () => {
    const photos = { resource: 'repair_photos', field: 'repairId', image: 'photo', sort: 'position' }
    const withPhotos = view<typeof repairs>('repairs').list((r, d) => ({ columns: [r.number], displays: [d.cards({ title: r.number }, { photos })] })).toModel()
    const cards = (models: Record<string, ResourceModel>) => pruneView(withPhotos, models.repairs!, models).list?.displays
    expect(cards(all)).toEqual([{ kind: 'cards', name: 'cards', title: 'number', photos }])
    expect(cards(without({ repair_photos: ['photo'] }))).toEqual([{ kind: 'cards', name: 'cards', title: 'number' }])
    expect(cards(without({ repair_photos: ['repairId'] }))).toEqual([{ kind: 'cards', name: 'cards', title: 'number' }])
    expect(cards(without({}, ['repair_photos']))).toEqual([{ kind: 'cards', name: 'cards', title: 'number' }])
  })

  it("keeps a gallery's image and photos as far as the caller can load them, and leaves out one with neither", () => {
    const photos = { resource: 'repair_photos', field: 'repairId', image: 'photo', sort: 'position' }
    const written = view<typeof repairs>('repairs').recordMode('read').helpWhen('editing').layout((r) => [l.section('Repair', [r.status], { help: 'As booked', helpWhen: 'always', presentation: 'facts' })]).toModel()
    // The repair's own picture stands in for a file field: pruning reads only whether the caller may see it
    written.layout = [...written.layout, { kind: 'gallery', title: 'Photos', image: 'costPrice', photos }]
    const galleries = (models: Record<string, ResourceModel>) => pruneView(written, models.repairs!, models).layout.filter((item) => item.kind === 'gallery')
    expect(pruneView(written, all.repairs, all)).toEqual(written)
    expect(galleries(without({ repairs: ['costPrice'] }))).toEqual([{ kind: 'gallery', title: 'Photos', photos }])
    expect(galleries(without({ repair_photos: ['photo'] }))).toEqual([{ kind: 'gallery', title: 'Photos', image: 'costPrice' }])
    expect(galleries(without({ repairs: ['costPrice'] }, ['repair_photos']))).toEqual([])
  })

  it('keeps a related section but drops the relation its rows open when the caller cannot read it', () => {
    const written = view<typeof customers>('customers')
      .layout(() => [l.related('Repairs', { resource: 'customer_repairs', field: 'customerId', open: 'repairId' })])
      .toModel()
    const related = (models: Record<string, ResourceModel>) => pruneView(written, models.customers!, models).layout
    expect(related(all)).toEqual(written.layout)
    expect(related(without({ customer_repairs: ['repairId'] }))).toEqual([{ kind: 'related', title: 'Repairs', resource: 'customer_repairs', field: 'customerId' }])
    expect(related(without({}, ['repairs']))).toEqual([{ kind: 'related', title: 'Repairs', resource: 'customer_repairs', field: 'customerId' }])
  })

  it('keeps hideEmpty and a record condition, and leaves out an item whose condition names a field the caller cannot read', () => {
    const written = view<typeof repairs>('repairs')
      .layout((r) => [l.section('Paid', [r.status], { when: 'paid = true' }), l.sidebar([r.number], { when: 'paid = true' }), l.related('Photos', { resource: 'repair_photos', field: 'repairId', when: 'paid = true', hideEmpty: true })])
      .toModel()
    expect(pruneView(written, all.repairs, all).layout).toEqual(written.layout)
    const hidden = without({ repairs: ['paid'] })
    expect(pruneView(written, hidden.repairs!, hidden).layout).toEqual([])
  })

  it('prunes a group by what it holds, and drops one left empty', () => {
    const written = view<typeof customers>('customers')
      .layout(() => [l.group('More', [l.related('Repairs', { resource: 'customer_repairs', field: 'customerId' })], { collapsed: true })])
      .toModel()
    const layout = (models: Record<string, ResourceModel>) => pruneView(written, models.customers!, models).layout
    expect(layout(all)).toEqual(written.layout)
    expect(layout(without({}, ['customer_repairs']))).toEqual([])
  })

  it('prunes a tab by what it holds, and drops one left empty', () => {
    const written = view<typeof customers>('customers')
      .layout(() => [l.tab('Work', [l.related('Repairs', { resource: 'customer_repairs', field: 'customerId' })])])
      .toModel()
    const layout = (models: Record<string, ResourceModel>) => pruneView(written, models.customers!, models).layout
    expect(layout(all)).toEqual(written.layout)
    expect(layout(without({}, ['customer_repairs']))).toEqual([])
  })

  it('keeps when every layout item shows', () => {
    const photos = { resource: 'repair_photos', field: 'repairId', image: 'photo', sort: 'position' }
    const written = view<typeof repairs>('repairs')
      .fields((r) => ({ estimate: r.estimate.when('editing') }))
      .layout((r) => [
        l.section('Repair', [r.status], { when: 'reading' }),
        l.sidebar([r.number], { when: 'editing' }),
        l.related('Photos', { resource: 'repair_photos', field: 'repairId', when: 'editing' }),
        l.gallery('Gallery', { photos, when: 'reading' }),
        l.map('Where', { latitude: r.estimate, longitude: r.costPrice, when: 'always' }),
      ])
      .toModel()
    expect(pruneView(written, all.repairs, all)).toEqual(written)
  })

  it('leaves out a map whose position the caller cannot read', () => {
    const mapped = view<typeof repairs>('repairs').layout((r) => [l.map('Where', { latitude: r.estimate, longitude: r.costPrice, zoom: 12, sidebar: true }), l.section('Repair', [r.status])]).toModel()
    expect(pruneView(mapped, all.repairs, all).layout).toEqual(mapped.layout)
    const hidden = without({ repairs: ['costPrice'] })
    expect(pruneView(mapped, hidden.repairs!, hidden).layout).toEqual([{ kind: 'section', title: 'Repair', fields: ['status'] }])
  })

  it('keeps a map display\'s approximate positions only as far as the caller can read the fields that state them', () => {
    const mapped = view<typeof repairs>('repairs')
      .list((r, d) => ({ columns: [r.number], displays: [d.map({ latitude: r.estimate, longitude: r.costPrice, exact: r.insured, radius: r.estimate }, { defaultRadius: 100 })] }))
      .toModel()
    const displays = (models: Record<string, ResourceModel>) => pruneView(mapped, models.repairs!, models).list?.displays
    expect(displays(all)).toEqual([{ kind: 'map', name: 'map', latitude: 'estimate', longitude: 'costPrice', exact: 'insured', radius: 'estimate', defaultRadius: 100 }])
    expect(displays(without({ repairs: ['insured'] }))).toEqual([{ kind: 'map', name: 'map', latitude: 'estimate', longitude: 'costPrice', radius: 'estimate', defaultRadius: 100 }])
  })

  it('keeps a board for a caller who can read its columns, its card without the fields they cannot, and opens the table without it', () => {
    const board = view<typeof repairs>('repairs')
      .list((r, d) => ({ columns: [r.number], displays: [d.board({ by: r.status, title: r.number, meta: [r.costPrice, r.bookedOn] })], default: 'board' }))
      .toModel()
    const list = (models: Record<string, ResourceModel>) => pruneView(board, models.repairs!, models).list
    expect(list(without({ repairs: ['costPrice'] }))).toEqual({ columns: ['number'], displays: [{ kind: 'board', name: 'board', by: 'status', title: 'number', meta: ['bookedOn'] }], default: 'board' })
    expect(list(without({ repairs: ['status'] }))).toEqual({ columns: ['number'] })
  })

  it('keeps a calendar for a caller who can read its start, its event without a title they cannot read, and opens the table without it', () => {
    const calendar = view<typeof repairs>('repairs')
      .list((r, d) => ({ columns: [r.number], displays: [d.calendar({ start: r.bookedOn, title: r.costPrice })], default: 'calendar' }))
      .toModel()
    const list = (models: Record<string, ResourceModel>) => pruneView(calendar, models.repairs!, models).list
    expect(list(without({ repairs: ['costPrice'] }))).toEqual({ columns: ['number'], displays: [{ kind: 'calendar', name: 'calendar', start: 'bookedOn' }], default: 'calendar' })
    expect(list(without({ repairs: ['bookedOn'] }))).toEqual({ columns: ['number'] })
  })
})
