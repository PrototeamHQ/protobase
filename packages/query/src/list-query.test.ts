import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { extraSelections } from './list-query'

const items = resource('items').table('items').fields({ id: f.integer(), qty: f.integer() }).primaryKey((r) => r.id).toModel()
const select = (alias: string) => () => extraSelections(items, [{ field: 'qty', as: 'text', alias }])
const refused = expect.objectContaining({ code: 'invalid_option' })

describe('extraSelections', () => {
  it('refuses an alias that collides with a field or an internal column', () => {
    expect(select('__pb_rank')).toThrow(refused)
    expect(select('__pb_key0')).toThrow(refused)
    expect(select('qty')).toThrow(refused)
  })

  it('takes any other alias', () => {
    expect(select('__version')).not.toThrow()
  })
})
