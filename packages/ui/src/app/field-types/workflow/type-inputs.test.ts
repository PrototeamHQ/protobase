import { describe, expect, it } from 'vitest'
import { schemaInputs } from './type-inputs'

describe('schemaInputs', () => {
  it('draws a field for each input by its schema, the required ones marked', () => {
    const input = {
      type: 'object',
      required: ['subject', 'count'],
      properties: {
        subject: { type: 'string', title: 'Subject line', description: 'one line' },
        count: { type: 'integer' },
        ratio: { type: 'number' },
        urgent: { type: 'boolean' },
        priority: { enum: ['low', 'high'] },
        tags: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'object' } },
        address: { type: 'object', properties: { city: { type: 'string' } } },
        key: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
    }
    expect(schemaInputs(input)).toEqual([
      { name: 'subject', kind: 'text', required: true, title: 'Subject line' },
      { name: 'count', kind: 'value', required: true },
      { name: 'ratio', kind: 'value', required: false },
      { name: 'urgent', kind: 'value', required: false },
      { name: 'priority', kind: 'choice', options: ['low', 'high'], required: false },
      { name: 'tags', kind: 'names', required: false },
      { name: 'rows', kind: 'json', required: false },
      { name: 'address', kind: 'json', required: false },
      { name: 'key', kind: 'json', required: false },
    ])
  })

  it('takes a schema without properties, such as manual\'s, as no inputs', () => {
    expect(schemaInputs({ type: 'object', additionalProperties: false })).toEqual([])
  })
})
