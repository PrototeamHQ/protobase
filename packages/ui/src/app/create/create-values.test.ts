import { describe, expect, it } from 'vitest'
import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { createBody, createSections, hasDatabaseDefault, initialDraft, isRequired } from './create-values'

const field = (name: string, type: FieldModel['type'], extra: Partial<FieldModel> = {}) =>
  ({ name, column: name, type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra }) as FieldModel

const users = { name: 'users', primaryKey: ['id'], fields: { id: field('id', 'integer', { readOnly: true }) } } as unknown as ResourceModel
const orders = {
  name: 'orders',
  primaryKey: ['id'],
  tenant: 'organizationId',
  fields: {
    id: field('id', 'uuid', { readOnly: true }),
    organizationId: field('organizationId', 'relation', { relation: { resource: 'organizations', columns: [] } }),
    number: field('number', 'text'),
    ownerId: field('ownerId', 'relation', { relation: { resource: 'users', columns: [] } }),
    status: field('status', 'enum', { enumValues: ['draft', 'shipped'] }),
    total: field('total', 'decimal'),
    paid: field('paid', 'boolean'),
    quantity: field('quantity', 'integer'),
    notes: field('notes', 'text', { nullable: true }),
    createdAt: field('createdAt', 'timestamp', { readOnly: true }),
  },
} as unknown as ResourceModel

describe('createSections', () => {
  it('lists creatable fields in one section when the view has no layout', () => {
    const [section] = createSections(orders, undefined)
    expect(section).toMatchObject({ title: 'Details', fields: ['number', 'ownerId', 'status', 'total', 'paid', 'quantity', 'notes'] })
  })

  it('keeps the view sections and adds the fields they leave out', () => {
    const view = { layout: [{ kind: 'section', title: 'Money', help: 'h', fields: ['total', 'createdAt', 'id'] }, { kind: 'sidebar', fields: ['status'] }] } as unknown as ViewModel
    const sections = createSections(orders, view)
    expect(sections.map((section) => [section.title, section.fields])).toEqual([
      ['Money', ['total']],
      ['Other fields', ['number', 'ownerId', 'status', 'paid', 'quantity', 'notes']],
    ])
  })
})

describe('createBody', () => {
  it('sends only filled fields, with types the server accepts', () => {
    const body = createBody(orders, { users }, { number: 'SO-1', ownerId: { key: '5', label: 'Imke V.' }, status: 'draft', total: ' 12.50 ', quantity: '3', notes: '', paid: true })
    expect(body).toEqual({ number: 'SO-1', ownerId: 5, status: 'draft', total: '12.50', quantity: 3, paid: true })
  })

  it('leaves out untouched fields so defaults apply', () => {
    expect(createBody(orders, { users }, { total: '', status: '' })).toEqual({})
  })
})

describe('defaults', () => {
  const withDefaults = {
    ...orders,
    fields: {
      ...orders.fields,
      status: { ...orders.fields.status!, default: { value: 'draft' } },
      total: { ...orders.fields.total!, default: { value: '0' } },
      notes: { ...orders.fields.notes!, default: { db: true } },
      number: { ...orders.fields.number!, default: { db: true } },
      paid: { ...orders.fields.paid!, default: { value: false } },
    },
  } as unknown as ResourceModel

  it('prefills literal defaults and leaves database defaults to the database', () => {
    expect(initialDraft(withDefaults, createSections(withDefaults, undefined))).toEqual({ status: 'draft', total: '0', paid: false })
  })

  it('does not require fields that have a default, or that can be empty', () => {
    expect(isRequired(withDefaults.fields.number!)).toBe(false)
    expect(isRequired(withDefaults.fields.status!)).toBe(false)
    expect(isRequired(orders.fields.number!)).toBe(true)
    expect(isRequired(orders.fields.notes!)).toBe(false)
    expect(isRequired(orders.fields.paid!)).toBe(false)
  })

  it('knows which defaults the database supplies', () => {
    expect(hasDatabaseDefault(withDefaults.fields.number!)).toBe(true)
    expect(hasDatabaseDefault(withDefaults.fields.status!)).toBe(false)
  })
})
