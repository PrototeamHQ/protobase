import { z } from 'zod'

export const text = {
  type: 'text',
  constraints: ['min', 'max', 'regex'],
  build: (o: { min?: number; max?: number; regex?: { re: RegExp; message: string } }) => {
    let schema = z.string()
    if (o.min !== undefined) schema = schema.min(o.min)
    if (o.max !== undefined) schema = schema.max(o.max)
    if (o.regex) schema = schema.regex(o.regex.re, o.regex.message)
    return schema
  },
} as const
