import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { relationOptionsQuery, titleMatches } from './relation-options'

const companies = resource('companies')
  .table('companies')
  .fields({ id: f.integer().filterable(), name: f.text().filterable(), city: f.text() })
  .primaryKey((r) => r.id)
  .search((r) => [r.name, r.city])
  .toModel()

const tags = resource('tags')
  .table('tags')
  .fields({ id: f.integer().filterable(), name: f.text().filterable(), size: f.integer().filterable() })
  .primaryKey((r) => r.id)
  .toModel()

const categories = resource('categories')
  .table('categories')
  .fields({ id: f.integer().filterable(), name: f.text() })
  .primaryKey((r) => r.id)
  .toModel()

describe('relationOptionsQuery', () => {
  it('asks for every record while nothing is typed', () => {
    expect(relationOptionsQuery(companies, 'name', '  ')).toEqual({ filter: undefined, local: false })
    expect(relationOptionsQuery(categories, 'name', '')).toEqual({ filter: undefined, local: false })
  })

  it("uses the target's search when it has search fields", () => {
    expect(relationOptionsQuery(companies, 'name', 'acme')).toEqual({ filter: 'search("acme")', local: false })
  })

  it('matches every word in a filterable text title, with typed wildcards dropped', () => {
    expect(relationOptionsQuery(tags, 'name', 'fa  b*lt')).toEqual({ filter: 'name = "*fa*" AND name = "*blt*"', local: false })
  })

  it('leaves the match to the picker when the title cannot be filtered on as text', () => {
    expect(relationOptionsQuery(categories, 'name', 'fa')).toEqual({ filter: undefined, local: true })
    expect(relationOptionsQuery(tags, 'size', '3')).toEqual({ filter: undefined, local: true })
  })

  it('leaves the match to the picker once the server refused to narrow', () => {
    expect(relationOptionsQuery(companies, 'name', 'acme', true)).toEqual({ filter: undefined, local: true })
    expect(relationOptionsQuery(tags, 'name', 'fa', true)).toEqual({ filter: undefined, local: true })
  })
})

describe('titleMatches', () => {
  it('holds when every word appears, ignoring case', () => {
    expect(titleMatches('Nuts and washers', 'WASH nut')).toBe(true)
    expect(titleMatches('Nuts and washers', 'bolt nut')).toBe(false)
    expect(titleMatches(12, '2')).toBe(true)
  })

  it('never matches a missing title', () => {
    expect(titleMatches(null, 'a')).toBe(false)
    expect(titleMatches(undefined, 'a')).toBe(false)
  })
})
