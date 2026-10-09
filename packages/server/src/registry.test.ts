import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { buildRegistry } from './registry'
import { lineItems, labels } from '../../../test-support/server'

const parent = resource('parent').table('parent').fields({ a: f.integer(), b: f.integer() }).primaryKey((r) => [r.a, r.b])
const child = resource('child').table('child').fields({ parentRef: f.relation('parent').columns(['a', 'b']) }).primaryKey((r) => r.parentRef)

const named = resource('named').table('named').fields({ id: f.integer(), etag: f.text() }).primaryKey((r) => r.id)

describe('buildRegistry', () => {
  it('refuses a field named etag', () => {
    expect(() => buildRegistry([named])).toThrow(/field named "etag"/)
  })

  it('types relation key parts through their target', () => {
    expect(buildRegistry([labels, lineItems]).find('lineItems')?.keyTypes).toEqual(['integer', 'integer'])
  })

  it('refuses a key that points at a composite-key resource, naming it', () => {
    expect(() => buildRegistry([parent, child])).toThrow(/Not implemented: resource "child"/)
  })
})
