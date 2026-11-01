import { describe, expect, it } from 'vitest'
import { inputSchemaMemo } from './mcp-input-schemas'

const parameters = () => ({ type: 'object' as const, properties: { text: { type: 'string' } } })

describe('inputSchemaMemo', () => {
  it('returns the same input schema for the same parameters object', () => {
    const inputSchemaOf = inputSchemaMemo(2)
    const first = parameters()
    expect(inputSchemaOf(first)).toBe(inputSchemaOf(first))
  })

  it('drops the oldest input schema once it holds more than its limit', () => {
    const inputSchemaOf = inputSchemaMemo(2)
    const [first, second, third] = [parameters(), parameters(), parameters()]
    const firstSchema = inputSchemaOf(first)
    const secondSchema = inputSchemaOf(second)
    inputSchemaOf(third)
    expect(inputSchemaOf(second)).toBe(secondSchema)
    expect(inputSchemaOf(first)).not.toBe(firstSchema)
  })

  it('keeps a recently used input schema over an older one', () => {
    const inputSchemaOf = inputSchemaMemo(2)
    const [first, second, third] = [parameters(), parameters(), parameters()]
    const firstSchema = inputSchemaOf(first)
    const secondSchema = inputSchemaOf(second)
    inputSchemaOf(first)
    inputSchemaOf(third)
    expect(inputSchemaOf(first)).toBe(firstSchema)
    expect(inputSchemaOf(second)).not.toBe(secondSchema)
  })
})
