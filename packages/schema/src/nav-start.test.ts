import { describe, expect, it } from 'vitest'
import { f } from './fields'
import { navStartErrors } from './nav-start'
import { resource } from './resource'
import { view } from './view'

const channels = resource('channels')
  .table('channels')
  .fields({
    id: f.integer(),
    name: f.text().filterable().sortable(),
    topic: f.text(),
  })
  .primaryKey((r) => r.id)

const model = channels.toModel()

describe('navStartErrors', () => {
  it('accepts a filter on a filterable field and an order', () => {
    expect(navStartErrors({ filter: 'name = "general"', orderBy: 'name asc' }, model)).toEqual([])
  })

  it('refuses an empty filter', () => {
    expect(navStartErrors({ filter: ' ' }, model)).toEqual(['needs a filter that finds the record'])
  })

  it('refuses a filter on a field that is not filterable', () => {
    expect(navStartErrors({ filter: 'topic = "news"' }, model)).toHaveLength(1)
  })

  it('names an order that does not parse', () => {
    expect(navStartErrors({ filter: 'name = "general"', orderBy: 'name sideways' }, model)[0]).toMatch(/^orderBy: /)
  })

  it('fails the view at build time', () => {
    expect(() => view<typeof channels>('channels').nav({ start: { filter: 'topic = "news"' } }).toModel(model)).toThrow(/nav\.start filter: /)
  })
})
