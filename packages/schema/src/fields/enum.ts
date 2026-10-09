import { z } from 'zod'

export const enumeration = {
  type: 'enum',
  constraints: [],
  build: (o: { enumValues?: string[] }) => {
    if (!o.enumValues?.length) throw new Error('f.enum requires at least one value')
    return z.enum(o.enumValues)
  },
} as const
