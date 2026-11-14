import { describe, expect, it } from 'vitest'
import { f, resource } from '../index'
import { recordJsonSchema } from './record-schema'

const contacts = resource('contacts')
  .table('contacts')
  .fields({
    id: f.bigint().readOnly().dbDefault(),
    name: f.text(),
    visits: f.integer().optional(),
    status: f.enum(['lead', 'customer']),
    balance: f.decimal({ precision: 10, scale: 2 }),
  })
  .primaryKey((r) => r.id)
  .toModel()

describe('recordJsonSchema', () => {
  it('types each field as the API gives it, and as a write takes it without the read-only ones', () => {
    expect(recordJsonSchema(contacts, 'read', 'Contact')).toEqual({
      type: 'object',
      title: 'Contact',
      properties: { id: { type: 'string' }, name: { type: 'string' }, visits: { type: 'integer' }, status: { type: 'string', enum: ['lead', 'customer'] }, balance: { type: 'string' } },
    })
    expect(recordJsonSchema(contacts, 'write').properties).toEqual({ name: { type: 'string' }, visits: { type: 'integer' }, status: { type: 'string', enum: ['lead', 'customer'] }, balance: { type: ['string', 'number'] } })
  })
})
