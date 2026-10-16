import { describe, expect, it } from 'vitest'
import { filledFields } from './filled-fields'

describe('filledFields', () => {
  it('keeps the fields with a value, in order, a zero and false among them', () => {
    const record = { price: 425000, rent: null, rooms: 0, garden: false, label: '', type: 'house' }
    expect(filledFields(record, ['type', 'price', 'rent', 'rooms', 'garden', 'label', 'missing'])).toEqual(['type', 'price', 'rooms', 'garden'])
  })
})
