import { describe, expect, it } from 'vitest'
import { f, resource } from '../index'
import type { ResourceModel } from '../model'
import { keyTypes, recordJsonSchema } from './record-schema'

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
    expect(recordJsonSchema(contacts, 'write').properties).toEqual({ name: { type: 'string' }, visits: { type: ['integer', 'null'] }, status: { type: 'string', enum: ['lead', 'customer'] }, balance: { type: ['string', 'number'] } })
  })

  it("reads a relation as its target's key, a number for an integer key, and lets a write to an optional field take null", () => {
    const accounts = resource('accounts').table('accounts').fields({ id: f.integer().readOnly().dbDefault(), name: f.text() }).primaryKey((r) => r.id).toModel()
    const people = resource('people')
      .table('people')
      .fields({ id: f.uuid().readOnly().dbDefault(), account_id: f.relation('accounts'), contact_id: f.relation('contacts').optional(), stage: f.enum(['new', 'won']).optional() })
      .primaryKey((r) => r.id)
      .toModel()
    const models: Record<string, ResourceModel> = { accounts, contacts, people }
    const keyType = keyTypes((name) => models[name])
    expect(recordJsonSchema(people, 'read', 'Person', keyType).properties).toEqual({ id: { type: 'string' }, account_id: { type: 'integer' }, contact_id: { type: 'string' }, stage: { type: 'string', enum: ['new', 'won'] } })
    expect(recordJsonSchema(people, 'write', 'Person', keyType).properties).toEqual({ account_id: { type: ['string', 'integer'] }, contact_id: { type: ['string', 'integer', 'null'] }, stage: { type: ['string', 'null'], enum: ['new', 'won', null] } })
  })

  it('reads a file as the file it holds, and writes it as the text of an upload ticket', () => {
    const notes = resource('notes').table('notes').fields({ id: f.bigint().readOnly().dbDefault(), attachment: f.file().optional() }).primaryKey((r) => r.id).toModel()
    const field = (use: 'read' | 'write') => (recordJsonSchema(notes, use).properties as Record<string, unknown>).attachment
    expect(field('read')).toMatchObject({ type: 'object', title: 'File' })
    expect(field('write')).toEqual({ type: ['string', 'null'] })
  })
})
