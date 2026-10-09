import { z } from 'zod'

export const country = {
  type: 'country',
  constraints: [],
  build: () => z.string().regex(/^[A-Z]{2}$/, 'Expected an ISO 3166-1 alpha-2 country code'),
} as const
