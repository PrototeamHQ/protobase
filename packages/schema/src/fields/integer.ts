import { z } from 'zod'

export const integer = {
  type: 'integer',
  constraints: ['min', 'max'],
  build: (o: { min?: number; max?: number }) => {
    let schema = z.int()
    if (o.min !== undefined) schema = schema.min(o.min)
    if (o.max !== undefined) schema = schema.max(o.max)
    return schema
  },
} as const
