import { describe, expect, it } from 'vitest'
import type { ResourcePermissions } from '@protobase/client'
import { view } from '@protobase/schema'
import { createOffered } from './create-offered'

const allowed: ResourcePermissions = { create: true, update: true, delete: true, conditional: [] }
const refused: ResourcePermissions = { create: false, update: false, delete: false, conditional: [] }
const plain = view('apps').toModel()
const paged = view('apps').create({ page: 'new-app' }).toModel()

describe('createOffered', () => {
  it('offers the create form to whoever may create records', () => {
    expect(createOffered(plain, {}, allowed)).toBe(true)
    expect(createOffered(plain, {}, refused)).toBe(false)
    expect(createOffered(undefined, {}, { ...refused, conditional: ['create'] })).toBe(true)
  })

  it("offers a view's create page to whoever gets the page, whatever the resource's access", () => {
    expect(createOffered(paged, { 'new-app': {} }, refused)).toBe(true)
    expect(createOffered(paged, {}, allowed)).toBe(false)
  })
})
