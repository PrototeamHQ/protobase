import { z } from 'zod'

export const relation = {
  type: 'relation',
  constraints: [],
  build: () => z.union([z.string(), z.int()]),
} as const
