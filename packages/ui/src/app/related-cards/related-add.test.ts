import { describe, expect, it } from 'vitest'
import type { ResourcePermissions } from '@protobase/client'
import { view, type RelatedModel } from '@protobase/schema'
import { relatedAdd } from './related-add'

const allowed: ResourcePermissions = { create: true, update: true, delete: true, conditional: [] }
const refused: ResourcePermissions = { create: false, update: false, delete: false, conditional: [] }
const notes: RelatedModel = { kind: 'related', title: 'Notes', resource: 'notes', field: 'objective_id', presentation: 'record' }
const plain = view('notes').toModel()

describe('relatedAdd', () => {
  it('starts a record with the field filled in with this record\'s key', () => {
    expect(relatedAdd(notes, 2, plain, {}, allowed)).toEqual({ kind: 'create', resource: 'notes', values: { objective_id: '2' } })
  })

  it('offers nothing to whoever may not create records', () => {
    expect(relatedAdd(notes, 2, plain, {}, refused)).toBeUndefined()
  })

  it('offers nothing without a key or through a join resource', () => {
    expect(relatedAdd(notes, null, plain, {}, allowed)).toBeUndefined()
    expect(relatedAdd({ ...notes, through: { resource: 'links', field: 'objective_id' } }, 2, plain, {}, allowed)).toBeUndefined()
  })
})
