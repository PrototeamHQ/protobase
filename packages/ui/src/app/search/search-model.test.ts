import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { MetaData } from '../../data/meta-data'
import { searchFields, searchFilter, searchPlaceholder, searchTargets, subtitleField, titleFields, toHit } from './search-model'

const model = (name: string, extra: Partial<ResourceModel> = {}) => ({ name, table: { name }, primaryKey: ['id'], fields: {}, search: ['name'], ...extra }) as ResourceModel
const view = (resource: string, extra: Partial<ViewModel> = {}) => ({ resource, fields: {}, filters: [], layout: [], actions: [], ...extra }) as ViewModel

const meta = (resources: ResourceModel[], views: ViewModel[], permissions: MetaData['permissions'] = {}): MetaData => ({
  etag: '"x"',
  resources: Object.fromEntries(resources.map((entry) => [entry.name, entry])),
  views: Object.fromEntries(views.map((entry) => [entry.resource, entry])),
  pages: {},
  permissions,
})

describe('searchTargets', () => {
  it('looks in resources with search fields and a view the user can read', () => {
    const all = meta(
      [model('organizations'), model('services'), model('auditLog', { search: undefined }), model('invoiceLines'), model('secrets'), model('orphans')],
      [view('organizations', { names: { singular: 'Organization', plural: 'Organizations' } }), view('services'), view('auditLog'), view('invoiceLines', { nav: { hidden: true } }), view('secrets')],
      { secrets: { read: false, create: true, update: false, delete: false, conditional: [] } },
    )
    expect(searchTargets(all).map((target) => [target.model.name, target.label])).toEqual([['organizations', 'Organizations'], ['services', 'Services']])
  })
})

describe('searchPlaceholder', () => {
  it('names the resources it looks in, two at most', () => {
    const targets = (names: string[]) => searchTargets(meta(names.map((name) => model(name)), names.map((name) => view(name))))
    expect(searchPlaceholder(targets([]))).toBe('Search')
    expect(searchPlaceholder(targets(['orders']))).toBe('Search orders')
    expect(searchPlaceholder(targets(['orders', 'companies']))).toBe('Search orders and companies')
    expect(searchPlaceholder(targets(['orders', 'companies', 'products', 'invoices']))).toBe('Search orders, companies and more')
  })
})

describe('searchFilter', () => {
  it("is the server's search, quoted safely", () => {
    expect(searchFilter('  Initech ')).toBe('search("Initech")')
    expect(searchFilter('say "hi" \\o/')).toBe('search("say \\"hi\\" \\\\o/")')
  })
})

describe('hits', () => {
  const lines = searchTargets(meta([model('stock', { primaryKey: ['partNo', 'size'], fields: { partNo: { name: 'partNo', type: 'text' }, name: { name: 'name', type: 'text' } } as never })], [view('stock', { title: 'name' })]))[0]!

  it('asks for the key, the title and the search fields', () => {
    expect(searchFields(lines)).toEqual(['partNo', 'size', 'name'])
  })

  it('links to the record, with a composite key as the record page has it, and falls back to the key for a title', () => {
    expect(toHit(lines, { partNo: 'CH 11', size: 'L', name: 'Chain' }, 'chain')).toEqual({ id: 'CH%2011,L', title: 'Chain', href: '/stock/CH%252011%2CL' })
    expect(toHit(lines, { partNo: 'CH', size: 'L', name: null }, 'ch').title).toBe('CH,L')
    expect(toHit(lines, { partNo: 'CH', size: 'L', name: 'Chain' }, 'chain', '/admin').href).toBe('/admin/stock/CH%2CL')
  })
})

describe('result lines', () => {
  const fields = Object.fromEntries(['id', 'firstName', 'lastName', 'email', 'phone', 'city', 'secret'].map((name) => [name, { name, type: 'text' }]))
  const people = model('people', { fields: fields as never, search: ['firstName', 'lastName', 'email', 'phone', 'city'], searchMatch: { phone: 'digitsEnd' } })
  const target = (extra: Partial<ViewModel> = {}) => searchTargets(meta([people], [view('people', { title: 'lastName', ...extra })]))[0]!
  const configured = target({ searchResult: { title: ['firstName', 'lastName'], subtitle: 'email' } })
  const anouk = { id: '7', firstName: 'Anouk', lastName: 'de Vries', email: 'anouk@example.nl', phone: '+31 6 47069623', city: 'Utrecht' }
  const lines = (hit: ReturnType<typeof toHit>) => [hit.title, hit.subtitle]

  it('joins the title fields and shows the default subtitle when the title explains the match', () => {
    expect(lines(toHit(configured, anouk, 'anouk vries'))).toEqual(['Anouk de Vries', 'anouk@example.nl'])
    expect(lines(toHit(configured, anouk, 'example'))).toEqual(['Anouk de Vries', 'anouk@example.nl'])
  })

  it('shows the field the search matched instead when neither line has it', () => {
    expect(lines(toHit(configured, anouk, '9623'))).toEqual(['Anouk de Vries', '+31 6 47069623'])
    expect(lines(toHit(configured, anouk, '+31 6 47069623'))).toEqual(['Anouk de Vries', '+31 6 47069623'])
    expect(lines(toHit(configured, anouk, 'anouk utrecht'))).toEqual(['Anouk de Vries', 'Utrecht'])
  })

  it('without a configured subtitle, uses the first search field not in the title', () => {
    expect(subtitleField(target())).toBe('firstName')
    expect(lines(toHit(target(), anouk, 'vries'))).toEqual(['de Vries', 'Anouk'])
    expect(lines(toHit(target(), anouk, '47069623'))).toEqual(['de Vries', '+31 6 47069623'])
  })

  it('has one line when the subtitle is empty, and asks only for fields the user can read', () => {
    expect(toHit(configured, { ...anouk, email: null }, 'anouk')).not.toHaveProperty('subtitle')
    expect(titleFields(configured)).toEqual(['firstName', 'lastName'])
    const narrow = searchTargets(meta([{ ...people, fields: { id: fields.id, lastName: fields.lastName } as never }], [view('people', { searchResult: { title: ['firstName', 'lastName'], subtitle: 'email' } })]))[0]!
    expect(searchFields(narrow)).toEqual(['id', 'lastName'])
  })
  it('shows an enum subtitle by its label', () => {
    const roles = model('leaseTenants', { fields: { id: { name: 'id', type: 'text' }, name: { name: 'name', type: 'text' }, role: { name: 'role', type: 'enum' } } as never })
    const labelled = searchTargets(meta([roles], [view('leaseTenants', { title: 'name', searchResult: { subtitle: 'role' }, fields: { role: { valueLabels: { co_signer: 'Co-signer' } } } })]))[0]!
    expect(lines(toHit(labelled, { id: '1', name: 'Ada', role: 'co_signer' }, 'ada'))).toEqual(['Ada', 'Co-signer'])
  })
})
