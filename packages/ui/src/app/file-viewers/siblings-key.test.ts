import { describe, expect, it } from 'vitest'
import { siblingsKey } from './siblings-key'

const file = { uri: 'files/a.png', name: 'a.png', type: 'image/png', url: '/a.png' }

describe('siblingsKey', () => {
  it('changes with a sibling’s uri, record key or field', () => {
    const key = siblingsKey([{ ...file, key: 1, field: 'report' }])
    expect(siblingsKey([{ ...file, key: 1, field: 'report' }])).toBe(key)
    expect(siblingsKey([{ ...file, uri: 'files/b.png', key: 1, field: 'report' }])).not.toBe(key)
    expect(siblingsKey([{ ...file, key: 2, field: 'report' }])).not.toBe(key)
    expect(siblingsKey([{ ...file, key: 1, field: 'appendix' }])).not.toBe(key)
    expect(siblingsKey([{ ...file, key: [1, 'a'], field: 'report' }])).not.toBe(siblingsKey([{ ...file, key: [1, 'b'], field: 'report' }]))
  })

  it('represents a missing key or field the same way', () => {
    expect(siblingsKey([file])).toBe(siblingsKey([{ ...file, key: undefined, field: undefined } as never]))
    expect(siblingsKey([file])).not.toBe(siblingsKey([{ ...file, key: 'null', field: 'null' }]))
  })
})
