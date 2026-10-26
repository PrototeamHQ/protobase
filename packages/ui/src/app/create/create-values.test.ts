import { describe, expect, it } from 'vitest'
import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { createBody, createSections, hasDatabaseDefault, initialDraft, isRequired, numberDefault } from './create-values'

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
    const view = { fields: {}, layout: [{ kind: 'section', title: 'Money', help: 'h', fields: ['total', 'createdAt', 'id'] }, { kind: 'sidebar', fields: ['status'] }] } as unknown as ViewModel
    const sections = createSections(orders, view)
    expect(sections.map((section) => [section.title, section.fields])).toEqual([
      ['Money', ['total']],
      ['Other fields', ['number', 'ownerId', 'status', 'paid', 'quantity', 'notes']],
    ])
  })

  it('leaves a section with a record condition off the create form, so its fields land in the last section', () => {
    const view = { fields: {}, layout: [{ kind: 'section', title: 'Money', fields: ['total'], when: 'status = "paid"' }] } as unknown as ViewModel
    expect(createSections(orders, view).map((section) => section.title)).toEqual(['Details'])
    expect(createSections(orders, view)[0]!.fields).toContain('total')
  })

  it('puts a write-only field on the form only where a section names it', () => {
    const sealed = { ...orders, fields: { ...orders.fields, sealed: field('sealed', 'text', { sensitive: true, writeOnly: true }) } } as ResourceModel
    expect(createSections(sealed, undefined)[0]!.fields).not.toContain('sealed')
    const view = { fields: {}, layout: [{ kind: 'section', title: 'Secret', fields: ['sealed'] }] } as unknown as ViewModel
    expect(createSections(sealed, view)[0]).toMatchObject({ title: 'Secret', fields: ['sealed'] })
  })

  it('shows the sections of a group as plain sections', () => {
    const view = { fields: {}, layout: [{ kind: 'group', title: 'More', collapsed: true, items: [{ kind: 'section', title: 'Money', fields: ['total'] }] }] } as unknown as ViewModel
    expect(createSections(orders, view).map((section) => section.title)).toEqual(['Money', 'Other fields'])
  })

  it('keeps sections and fields meant only for reading out of their sections, so their fields land in the last one', () => {
    const view = {
      fields: { number: { when: 'reading' }, notes: { when: 'editing' } },
      layout: [
        { kind: 'section', title: 'Summary', fields: ['total', 'status'], when: 'reading' },
        { kind: 'section', title: 'Order', fields: ['number', 'total', 'notes'], when: 'editing' },
      ],
    } as unknown as ViewModel
    expect(createSections(orders, view).map((section) => [section.title, section.fields])).toEqual([
      ['Order', ['total', 'notes']],
      ['Other fields', ['number', 'ownerId', 'status', 'paid', 'quantity']],
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

  it('prefills literal defaults but numbers, and leaves database defaults to the database', () => {
    expect(initialDraft(withDefaults, createSections(withDefaults, undefined))).toEqual({ status: 'draft', paid: false })
  })

  it('starts from the values the address gives, a relation as a record named by its key, over the defaults', () => {
    const given = { ownerId: '7', status: 'shipped', paid: 'true', createdAt: '2026-01-01', organizationId: '2' }
    expect(initialDraft(withDefaults, createSections(withDefaults, undefined), given)).toEqual({ ownerId: { key: '7', label: '7' }, status: 'shipped', paid: true })
  })

  it('does not require fields that have a default, or that can be empty', () => {
    expect(isRequired(withDefaults.fields.number!)).toBe(false)
    expect(isRequired(withDefaults.fields.status!)).toBe(false)
    expect(isRequired(orders.fields.number!)).toBe(true)
    expect(isRequired(orders.fields.notes!)).toBe(false)
    expect(isRequired(orders.fields.paid!)).toBe(false)
  })

  it("shows a number's literal default as its placeholder", () => {
    expect(numberDefault(withDefaults.fields.total!)).toBe('0')
    expect(numberDefault(withDefaults.fields.status!)).toBeUndefined()
    expect(numberDefault(orders.fields.quantity!)).toBeUndefined()
  })

  it('knows which defaults the database supplies', () => {
    expect(hasDatabaseDefault(withDefaults.fields.number!)).toBe(true)
    expect(hasDatabaseDefault(withDefaults.fields.status!)).toBe(false)
  })
})
