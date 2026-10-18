import { describe, expect, it } from 'vitest'
import type { ColumnSpec } from './column-spec'
import { defaultPins } from './default-pins'

const spec = (id: string, title = false): ColumnSpec => ({ id, header: id, kind: 'text', width: 100, ...(title && { title }) })

describe('defaultPins', () => {
  it('pins a title in the first column', () => {
    expect(defaultPins([spec('name', true), spec('city')])).toEqual(['name'])
  })

  it('pins the column before a title in the second column too, keeping their order', () => {
    expect(defaultPins([spec('id'), spec('name', true), spec('city')])).toEqual(['id', 'name'])
  })

  it('pins nothing for a title further right, or none', () => {
    expect(defaultPins([spec('id'), spec('kind'), spec('name', true)])).toEqual([])
    expect(defaultPins([spec('id'), spec('city')])).toEqual([])
  })
})
