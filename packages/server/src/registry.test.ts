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

  it('refuses an ETag from a field a record may leave empty, or a sensitive one', () => {
    const optional = resource('optional').table('optional').fields({ id: f.integer(), seen: f.integer().optional().readOnly() }).primaryKey((r) => r.id).etagFrom((r) => r.seen)
    const secret = resource('secret').table('secret').fields({ id: f.integer(), token: f.text().sensitive() }).primaryKey((r) => r.id).etagFrom((r) => r.token)
    expect(() => buildRegistry([optional])).toThrow(/etagFrom names "seen", which is optional/)
    expect(() => buildRegistry([secret])).toThrow(/etagFrom names "token", which is sensitive/)
  })

  it('types relation key parts through their target', () => {
    expect(buildRegistry([labels, lineItems]).find('lineItems')?.keyTypes).toEqual(['integer', 'integer'])
  })

  it('refuses a key that points at a composite-key resource, naming it', () => {
    expect(() => buildRegistry([parent, child])).toThrow(/Not implemented: resource "child"/)
  })
})
