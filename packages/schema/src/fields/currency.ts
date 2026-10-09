import { z } from 'zod'

export const currency = {
  type: 'currency',
  constraints: [],
  build: () => z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 currency code'),
} as const
