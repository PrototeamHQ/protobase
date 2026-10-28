import { describe, expect, it } from 'vitest'
import { peopleOf } from './people-endpoint'

describe('peopleOf', () => {
  it('answers id, name and photo by name, and leaves out people without a name', () => {
    expect(peopleOf([
      { id: 'u2', name: 'Sanne', image: null },
      { id: 'u1', name: 'Bo', image: 'https://example.com/bo.png' },
      { id: 'u3', name: '' },
    ])).toEqual([
      { id: 'u1', name: 'Bo', image: 'https://example.com/bo.png' },
      { id: 'u2', name: 'Sanne' },
    ])
  })

  it('never answers more than the id, name and photo, whatever the row holds', () => {
    const row = { id: 'u1', name: 'Bo', email: 'bo@example.com' }
    expect(peopleOf([row])).toEqual([{ id: 'u1', name: 'Bo' }])
  })
})
