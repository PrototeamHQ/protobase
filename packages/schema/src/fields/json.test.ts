import { describe, expect, it } from 'vitest'
import { f } from '../fields'
import { maxJsonDepth } from './json-depth'

const arrays = (depth: number) => '['.repeat(depth) + ']'.repeat(depth)
const objects = (depth: number) => '{"a":'.repeat(depth - 1) + '{}' + '}'.repeat(depth - 1)
const mixed = (depth: number) => '[{"a":'.repeat(depth / 2) + '1' + '}]'.repeat(depth / 2)

const fields = { plain: f.json(), optional: f.json().optional(), defaulted: f.json().default({}) }

describe('f.json()', () => {
  it.each(Object.entries(fields))('takes a %s value at the depth limit', (_, field) => {
    expect(field.schema.safeParse(JSON.parse(arrays(maxJsonDepth))).success).toBe(true)
    expect(field.schema.safeParse(JSON.parse(mixed(maxJsonDepth))).success).toBe(true)
  })

  it.each(Object.entries(fields).flatMap(([name, field]) => [arrays, objects, mixed].flatMap((shape) => [maxJsonDepth + 2, 100_000].map((depth) => [name, shape.name, depth, field, shape] as const))))(
    'refuses a %s value of %s nested %d levels with its own issue',
    (_name, _shape, depth, field, shape) => {
      const result = field.schema.safeParse(JSON.parse(shape(depth)))
      expect(result.success).toBe(false)
      expect(result.error!.issues).toEqual([expect.objectContaining({ code: 'custom', message: 'Nested deeper than 256 levels', params: { max_depth: 256 } })])
    },
  )
})
