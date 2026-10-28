import { describe, expect, it } from 'vitest'
import { f, l, resource, view, type AppAddress } from '@protobase/schema'
import { checkViews } from './check-views'
import type { Registry } from './registry'

const payments = resource('payments')
  .table('payments')
  .fields({ id: f.integer(), method: f.enum(['bank_transfer', 'ideal']).filterable(), reference: f.text(), iban: f.text().sensitive() })
  .primaryKey((r) => r.id)

const registry = { entries: [{ name: 'payments', model: payments.toModel() }] } as unknown as Registry

describe('checkViews', () => {
  it('takes a record condition on a section and refuses a syntax error or an unknown field', () => {
    const conditioned = (when: string) => view<typeof payments>('payments').layout((r) => [l.section('Bank', [r.reference], { when })]).toModel()
    expect(() => checkViews(registry, [conditioned('method = "ideal"')])).not.toThrow()
    expect(() => checkViews(registry, [conditioned('method =')])).toThrow('View "payments": section "Bank": "when" is not a valid condition')
    expect(() => checkViews(registry, [conditioned('nope = 1')])).toThrow('View "payments": section "Bank": unknown field "nope" on payments')
  })

  it('takes labels for values of an enum', () => {
    const labelled = view<typeof payments>('payments').fields((r) => ({ method: r.method.valueLabels({ ideal: 'iDEAL' }) }))
    expect(() => checkViews(registry, [labelled.toModel()])).not.toThrow()
  })

  it('refuses labels for values the enum does not have, or on a field that is not an enum', () => {
    const stale = view<typeof payments>('payments').toModel()
    stale.fields = { method: { valueLabels: { cash: 'Cash' } }, reference: { valueLabels: { x: 'X' } } }
    expect(() => checkViews(registry, [stale])).toThrow('value label "cash" is not a value of "method"')
    expect(() => checkViews(registry, [stale])).toThrow('value labels of "reference" need an enum field')
  })

  it('takes colours for values of an enum, and refuses colours for values it does not have or on another field', () => {
    const coloured = view<typeof payments>('payments').fields((r) => ({ method: r.method.valueColors({ ideal: '#cc0066' }).badgeShape('arrow') }))
    expect(() => checkViews(registry, [coloured.toModel()])).not.toThrow()
    const stale = view<typeof payments>('payments').toModel()
    stale.fields = { method: { valueColors: { cash: '#00a651' } }, reference: { valueColors: { x: '#000' } } }
    expect(() => checkViews(registry, [stale])).toThrow('value colour "cash" is not a value of "method"')
    expect(() => checkViews(registry, [stale])).toThrow('value colours of "reference" need an enum field')
  })

  it('takes multiline on a text field only', () => {
    const multiline = view<typeof payments>('payments').fields((r) => ({ reference: r.reference.multiline() }))
    expect(() => checkViews(registry, [multiline.toModel()])).not.toThrow()
    const written = view<typeof payments>('payments').toModel()
    written.fields = { method: { multiline: true } }
    expect(() => checkViews(registry, [written])).toThrow('View "payments": multiline "method" needs a text field, not enum')
  })

  it('takes an email, phone or url format on a text field only', () => {
    const linked = view<typeof payments>('payments').fields((r) => ({ reference: r.reference.format('url') }))
    expect(() => checkViews(registry, [linked.toModel()])).not.toThrow()
    const written = view<typeof payments>('payments').toModel()
    written.fields = { method: { format: 'phone' } }
    expect(() => checkViews(registry, [written])).toThrow(`View "payments": format('phone') of "method" needs a text field, not enum`)
  })

  it('takes markdown on a text field only', () => {
    const markdown = view<typeof payments>('payments').fields((r) => ({ reference: r.reference.markdown() }))
    expect(() => checkViews(registry, [markdown.toModel()])).not.toThrow()
    const written = view<typeof payments>('payments').toModel()
    written.fields = { method: { markdown: true } }
    expect(() => checkViews(registry, [written])).toThrow('View "payments": markdown "method" needs a text field, not enum')
  })

  it("refuses a field type of the app's plugins on a field of a storage type it does not show, and trusts unknown ones", () => {
    const shown = view<typeof payments>('payments').fields((r) => ({ reference: r.reference.widget('iban', { mask: true }), method: r.method.widget('chips') })).toModel()
    expect(() => checkViews(registry, [shown], [], { iban: ['text'] })).not.toThrow()
    expect(() => checkViews(registry, [shown], [], { iban: ['text'], chips: ['text', 'integer'] })).toThrow('View "payments": field "method" is enum, and its field type "chips" shows only text, integer')
  })

  it('refuses a derived title that reads a sensitive field', () => {
    expect(() => checkViews(registry, [view<typeof payments>('payments').titleFrom('account', (r) => [r.reference]).toModel()])).not.toThrow()
    expect(() => checkViews(registry, [view<typeof payments>('payments').titleFrom('account', (r) => [r.iban]).toModel()])).toThrow('sensitive field "iban" cannot be in the title')
  })

  it('wants links to go to addresses the app has, or out of it', () => {
    const linked = (to: AppAddress) => view<typeof payments>('payments').actions((a) => [a.link('go', { label: 'Go', to })]).toModel()
    expect(() => checkViews(registry, [linked({ kind: 'list', resource: 'payments', filter: 'method = "{method}"' })])).not.toThrow()
    expect(() => checkViews(registry, [linked({ kind: 'page', page: 'overview' })], ['overview'])).not.toThrow()
    expect(() => checkViews(registry, [linked({ kind: 'list', resource: 'refunds' })])).toThrow('View "payments": action "go": unknown resource "refunds"')
    expect(() => checkViews(registry, [linked({ kind: 'page', page: 'overview' })])).toThrow('action "go": unknown page "overview"')
    expect(() => checkViews(registry, [linked({ kind: 'record', resource: 'payments', key: '{iban}' })])).toThrow('sensitive field "iban" cannot be in an action')
    const written = view<typeof payments>('payments').toModel()
    written.actions = [{ name: 'old', label: 'Old', bulk: false, run: { kind: 'link', href: '/payments/{id}' } }]
    expect(() => checkViews(registry, [written])).toThrow('action "old": href "/payments/{id}" points inside the app; give the link `to` instead')
  })

  it('wants action inputs to fit: a handler to get them, and a choice of records to pick from a resource the app has', () => {
    const asked = view<typeof payments>('payments').actions((a) => [a.action('refund', { label: 'Refund', inputs: (i) => [i.choice('to', { label: 'To', resource: 'payments' })] })]).toModel()
    expect(() => checkViews(registry, [asked])).not.toThrow()
    const written = structuredClone(asked)
    written.actions = [{ name: 'refund', label: 'Refund', bulk: false, inputs: [{ name: 'to', kind: 'choice', label: 'To', required: true, resource: 'accounts' }] }]
    expect(() => checkViews(registry, [written])).toThrow('View "payments": action "refund": input "to" picks from resource "accounts", which the app does not have')
    written.actions = [{ name: 'paid', label: 'Paid', bulk: false, run: { kind: 'delete' }, inputs: [{ name: 'x', kind: 'text', label: 'X', required: true }, { name: 'x', kind: 'text', label: 'X', required: true }] }]
    expect(() => checkViews(registry, [written])).toThrow('action "paid": inputs need a handler, and a delete action has none')
    expect(() => checkViews(registry, [written])).toThrow('action "paid": input "x" is declared twice')
  })

  it('lets an update ask for inputs, and wants each {input} it sets to be one of them', () => {
    const asked = view<typeof payments>('payments').actions((a) => [a.update('note', { label: 'Note', inputs: (i) => [i.text('note', { label: 'Note' })], set: { id: '{note}' } })]).toModel()
    expect(() => checkViews(registry, [asked])).not.toThrow()
    const written = structuredClone(asked)
    written.actions = [{ name: 'note', label: 'Note', bulk: false, run: { kind: 'update', values: { id: '{nope}' } } }]
    expect(() => checkViews(registry, [written])).toThrow('action "note": set "id" names input "nope", which it does not ask for')
  })

  it('wants an AI action to write a text or enum field the API writes, from a prompt that reads fields the resource has', () => {
    const tickets = resource('tickets').table('tickets').fields({ id: f.integer().readOnly(), title: f.text(), priority: f.enum(['low', 'high']), secret: f.text().sensitive() }).primaryKey((r) => r.id)
    const ticketRegistry = { entries: [{ name: 'tickets', model: tickets.toModel() }] } as unknown as Registry
    const ai = (prompt: string, writes: string) => {
      const written = view<typeof tickets>('tickets').toModel()
      written.actions = [{ name: 'triage', label: 'Triage', bulk: false, run: { kind: 'ai', prompt, writes } }]
      return () => checkViews(ticketRegistry, [written])
    }
    expect(ai('How urgent is {title}?', 'priority')).not.toThrow()
    expect(ai('Translate {title}', 'title')).not.toThrow()
    expect(ai('How urgent?', 'priority')).toThrow('View "tickets": action "triage": its prompt must name at least one {field} of the record')
    expect(ai('{body}', 'priority')).toThrow('action "triage": its prompt names field "body", which tickets does not have')
    expect(ai('{title}', 'summary')).toThrow('action "triage": it writes field "summary", which tickets does not have')
    expect(ai('{title}', 'id')).toThrow('action "triage": it writes "id", which is integer, not text or an enum')
    expect(ai('{title}', 'id')).toThrow('action "triage": it writes "id", which is readOnly()')
    expect(ai('{secret}', 'title')).toThrow('sensitive field "secret" cannot be in an action')
    expect(ai('{title}', 'secret')).toThrow('sensitive field "secret" cannot be in an action')
  })

  it('wants a create page to be a page of the app', () => {
    const created = view<typeof payments>('payments').create({ page: 'new-payment' }).toModel()
    expect(() => checkViews(registry, [created], ['new-payment'])).not.toThrow()
    expect(() => checkViews(registry, [created])).toThrow('View "payments": create: unknown page "new-payment"')
  })

  it('lets a create link give values beyond the fields to a resource whose view opens a create page', () => {
    const linked = view<typeof payments>('payments').actions((a) => [a.link('again', { label: 'Again', to: { kind: 'create', resource: 'payments', values: { invoice_id: '{id}' } } })])
    expect(() => checkViews(registry, [linked.toModel()])).toThrow('action "again": values: unknown field "invoice_id" on payments')
    expect(() => checkViews(registry, [linked.create({ page: 'new-payment' }).toModel()], ['new-payment'])).not.toThrow()
  })

  it("wants a link to a record's URL to name a field the resource has, and {host} only in the label of an href", () => {
    const written = view<typeof payments>('payments').toModel()
    written.actions = [{ name: 'bank', label: 'View on {host}', bulk: false, run: { kind: 'link', href: '{reference}' } }]
    expect(() => checkViews(registry, [written])).not.toThrow()
    written.actions = [{ name: 'bank', label: 'View on {host}', bulk: false, run: { kind: 'link', href: '{website}' } }]
    expect(() => checkViews(registry, [written])).toThrow('View "payments": action "bank": href names field "website", which payments does not have')
    written.actions = [{ name: 'iban', label: 'Bank', bulk: false, run: { kind: 'link', href: '{iban}' } }]
    expect(() => checkViews(registry, [written])).toThrow('sensitive field "iban" cannot be in an action')
    written.actions = [{ name: 'list', label: 'All on {host}', bulk: false, run: { kind: 'link', to: { kind: 'list', resource: 'payments' } } }]
    expect(() => checkViews(registry, [written])).toThrow('View "payments": action "list": the label names {host}, which only a link with an href has')
  })

  it("checks a named list's displays like the view's, naming the list", () => {
    const named = view<typeof payments>('payments').namedList('updates', (v) => v.names({ singular: 'Update', plural: 'Updates' }).list((r, d) => ({ columns: [r.reference], displays: [d.board({ by: r.method, title: r.reference })] })))
    expect(() => checkViews(registry, [named.toModel()])).not.toThrow()
    const written = named.toModel()
    written.lists![0]!.list = { columns: ['reference'], displays: [{ kind: 'board', name: 'board', by: 'reference' }] }
    expect(() => checkViews(registry, [written])).toThrow('View "payments" list "updates": display "board": "reference" on payments is text, not an enum')
  })

  it('wants a board in columns of a filterable enum', () => {
    const board = view<typeof payments>('payments').list((r, d) => ({ columns: [r.reference], displays: [d.board({ by: r.method, title: r.reference })] }))
    expect(() => checkViews(registry, [board.toModel()])).not.toThrow()
    const written = view<typeof payments>('payments').toModel()
    written.list = { columns: ['reference'], displays: [{ kind: 'board', name: 'board', by: 'reference' }] }
    expect(() => checkViews(registry, [written])).toThrow('View "payments": display "board": "reference" on payments is text, not an enum, whose values are the board\'s columns')
  })

  it('wants a calendar by a filterable date or timestamp', () => {
    const written = view<typeof payments>('payments').toModel()
    written.list = { columns: ['reference'], displays: [{ kind: 'calendar', name: 'calendar', start: 'reference' }] }
    expect(() => checkViews(registry, [written])).toThrow('View "payments": display "calendar": start "reference" on payments is text, not a date or timestamp')
  })

  it('wants a timeline by a filterable date or timestamp', () => {
    const written = view<typeof payments>('payments').toModel()
    written.list = { columns: ['reference'], displays: [{ kind: 'timeline', name: 'timeline', start: 'reference' }] }
    expect(() => checkViews(registry, [written])).toThrow('View "payments": display "timeline": start "reference" on payments is text, not a date or timestamp')
  })

  it('wants list displays to show fields the resource has, none of them sensitive', () => {
    const Board = Object.assign((props: { by: string }) => props, { blockName: 'Board', custom: true })
    const shown = view<typeof payments>('payments').list((r, d) => ({ columns: [r.reference], displays: [d.cards({ badge: r.method }), d.custom(Board, { name: 'board', label: 'Board', fields: [r.reference], props: { by: r.iban } })] }))
    expect(() => checkViews(registry, [shown.toModel()])).toThrow('View "payments": sensitive field "iban" cannot be in a list display')
    const stale = view<typeof payments>('payments').toModel()
    stale.list = { columns: ['reference'], displays: [{ kind: 'cards', name: 'cards', meta: ['paidOn'] }] }
    expect(() => checkViews(registry, [stale])).toThrow('View "payments": display "cards" names field "paidOn", which payments does not have')
  })

  it('refuses a sensitive field among the fields of a flags filter', () => {
    const written = view<typeof payments>('payments').toModel()
    written.filters = [{ kind: 'flags', fields: ['reference', 'iban'], label: 'Known' }]
    expect(() => checkViews(registry, [written])).toThrow('View "payments": sensitive field "iban" cannot be in a filter')
  })

  it("wants a cards display's photos to fit the resources", () => {
    const shown = (resource: string) => view<typeof payments>('payments').list((r, d) => ({ columns: [r.reference], displays: [d.cards({ title: r.reference }, { photos: { resource, field: 'payment_id', image: 'scan' } })] }))
    expect(() => checkViews(registry, [shown('receipts').toModel()])).toThrow('View "payments": display "cards" photos: unknown resource "receipts"')
  })

  it("wants a list's cards displays to name the same photos, which its records load with", () => {
    const scans = resource('scans').table('scans').fields({ id: f.integer(), payment_id: f.relation('payments').filterable(), scan: f.file(), page: f.integer().sortable() }).primaryKey((r) => r.id)
    const withScans = { entries: [...registry.entries, { name: 'scans', model: scans.toModel() }] } as unknown as Registry
    const shown = (sort: string) =>
      view<typeof payments>('payments').list((r, d) => ({
        columns: [r.reference],
        displays: [
          d.cards({ title: r.reference }, { photos: { resource: 'scans', field: 'payment_id', image: 'scan', sort: 'page' } }),
          d.cards({ title: r.reference }, { name: 'plain' }),
          d.cards({ title: r.reference }, { name: 'gallery', photos: { resource: 'scans', field: 'payment_id', image: 'scan', sort } }),
        ],
      }))
    expect(() => checkViews(withScans, [shown('page').toModel()])).not.toThrow()
    expect(() => checkViews(withScans, [shown('page desc').toModel()])).toThrow('View "payments": display "gallery" photos: the list\'s records load with one set of photos, so name those of display "cards"')
  })

  it('checks the related tables inside a group', () => {
    const written = view<typeof payments>('payments').toModel()
    written.layout = [{ kind: 'group', title: 'More', items: [{ kind: 'related', title: 'Scans', resource: 'receipts', field: 'payment_id' }] }]
    expect(() => checkViews(registry, [written])).toThrow('View "payments": related "Scans"')
  })

  it('checks the items inside a tab', () => {
    const written = view<typeof payments>('payments').toModel()
    written.layout = [{ kind: 'tab', title: 'Log', items: [{ kind: 'history', title: 'Changes' }] }]
    expect(() => checkViews(registry, [written])).toThrow('history "Changes" needs .history()')
  })

  it("wants a gallery's image to be a file field and its photos to fit the resources", () => {
    const scans = resource('scans').table('scans').fields({ id: f.integer(), payment_id: f.relation('payments').filterable(), scan: f.file(), page: f.integer().sortable() }).primaryKey((r) => r.id)
    const withScans = { entries: [...registry.entries, { name: 'scans', model: scans.toModel() }] } as unknown as Registry
    const gallery = (image: string | undefined, photos: { resource: string; sort?: string }) => {
      const written = view<typeof payments>('payments').toModel()
      written.layout = [{ kind: 'gallery', title: 'Scans', ...(image && { image }), photos: { field: 'payment_id', image: 'scan', ...photos } }]
      return written
    }
    expect(() => checkViews(withScans, [gallery(undefined, { resource: 'scans', sort: 'page' })])).not.toThrow()
    expect(() => checkViews(withScans, [gallery(undefined, { resource: 'receipts' })])).toThrow('View "payments": gallery "Scans": photos: unknown resource "receipts"')
    expect(() => checkViews(withScans, [gallery('reference', { resource: 'scans' })])).toThrow('View "payments": gallery "Scans": "reference" is not a file field')
    expect(() => checkViews(withScans, [gallery('cover', { resource: 'scans' })])).toThrow('View "payments": gallery "Scans" names field "cover", which payments does not have')
  })

  it("wants a cards display's favorite button to save to records each user owns", () => {
    const saved = (owned: boolean) => {
      const base = resource('saved').table('saved').fields({ id: f.integer(), user_id: f.text().readOnly(), payment_id: f.relation('payments').filterable() }).primaryKey((r) => r.id)
      return owned ? base.owner((r) => r.user_id) : base
    }
    const shown = view<typeof payments>('payments').list((r, d) => ({ columns: [r.reference], displays: [d.cards({ title: r.reference }, { favorite: { resource: 'saved', field: 'payment_id' } })] }))
    const withSaved = (owned: boolean) => ({ entries: [...registry.entries, { name: 'saved', model: saved(owned).toModel() }] }) as unknown as Registry
    expect(() => checkViews(withSaved(true), [shown.toModel()])).not.toThrow()
    expect(() => checkViews(withSaved(false), [shown.toModel()])).toThrow(`View "payments": display "cards" favorite: saved has no owner, so its records are not each user's own`)
    expect(() => checkViews(registry, [shown.toModel()])).toThrow('View "payments": display "cards" favorite: unknown resource "saved"')
  })

  it('wants a "Save search" button whose searches a view lists, and those searches to be each user\'s own', () => {
    const searches = resource('searches').table('searches').fields({ id: f.integer(), user_id: f.text().readOnly(), filter: f.text() }).primaryKey((r) => r.id).owner((r) => r.user_id)
    const all = { entries: [...registry.entries, { name: 'searches', model: searches.toModel() }] } as unknown as Registry
    const saving = view<typeof payments>('payments').saveSearch({ resource: 'searches' }).toModel()
    const listing = view<typeof searches>('searches').searchesOf((r) => ({ resource: 'payments', filter: r.filter })).toModel()
    expect(() => checkViews(all, [saving, listing])).not.toThrow()
    expect(() => checkViews(all, [saving])).toThrow('View "payments": saveSearch: no view of searches has searchesOf("payments")')
    const elsewhere = view<typeof searches>('searches').searchesOf((r) => ({ resource: 'invoices', filter: r.filter })).toModel()
    expect(() => checkViews(all, [elsewhere])).toThrow('View "searches": searchesOf: unknown resource "invoices"')
  })

  it('wants listOf to point at records with a single-column key', () => {
    const visits = resource('visits').table('visits').fields({ payment_id: f.integer(), day: f.date() }).primaryKey((r) => [r.payment_id, r.day])
    const saved = resource('saved').table('saved').fields({ id: f.integer(), payment_id: f.relation('payments'), visit_id: f.relation('visits') }).primaryKey((r) => r.id)
    const all = { entries: [...registry.entries, { name: 'visits', model: visits.toModel() }, { name: 'saved', model: saved.toModel() }] } as unknown as Registry
    expect(() => checkViews(all, [view<typeof saved>('saved').listOf((r) => r.payment_id).toModel()])).not.toThrow()
    expect(() => checkViews(all, [view<typeof saved>('saved').listOf((r) => r.visit_id).toModel()])).toThrow('View "saved": listOf: visits has a composite key, so its records cannot be listed by key')
  })

  it('wants comments, like history, only on a resource that keeps them', () => {
    const thread = view<typeof payments>('payments').layout(() => [l.comments('Notes')]).toModel()
    expect(() => checkViews(registry, [thread])).toThrow('View "payments": comments "Notes" needs .comments() on resource "payments"')
    const commented = { entries: [{ name: 'payments', model: payments.comments().toModel() }] } as unknown as Registry
    expect(() => checkViews(commented, [thread])).not.toThrow()
  })

  it('wants a custom section to name fields the resource has', () => {
    const stale = view<typeof payments>('payments').toModel()
    stale.layout = [{ kind: 'custom', component: 'Receipt', props: { amount: { $field: 'amount' }, currency: 'EUR' } }]
    expect(() => checkViews(registry, [stale])).toThrow('View "payments": custom section Receipt names field "amount", which payments does not have')
  })

  it('wants a map to read a position from number fields, never sensitive ones', () => {
    const shops = resource('shops').table('shops').fields({ id: f.integer(), lat: f.decimal({ precision: 8, scale: 6 }), lng: f.decimal({ precision: 9, scale: 6 }), name: f.text(), secret_lat: f.decimal({ precision: 8, scale: 6 }).sensitive() }).primaryKey((r) => r.id)
    const shopsRegistry = { entries: [{ name: 'shops', model: shops.toModel() }] } as unknown as Registry
    const mapped = (build: Parameters<ReturnType<typeof view<typeof shops>>['layout']>[0]) => view<typeof shops>('shops').layout(build).toModel()
    expect(() => checkViews(shopsRegistry, [mapped((r) => [l.map('Location', { latitude: r.lat, longitude: r.lng })])])).not.toThrow()
    expect(() => checkViews(shopsRegistry, [mapped((r) => [l.map('Location', { latitude: r.name, longitude: r.lng, zoom: 30 })])])).toThrow(
      'View "shops": map "Location": "name" on shops is text, not a number of degrees\n  - View "shops": map "Location": zoom 30 is not between 0 and 22',
    )
    expect(() => checkViews(shopsRegistry, [mapped((r) => [l.map('Location', { latitude: r.secret_lat, longitude: r.lng })])])).toThrow('View "shops": sensitive field "secret_lat" cannot be in a map')
  })
})
