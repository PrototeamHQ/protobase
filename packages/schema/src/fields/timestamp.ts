import { z } from 'zod'

export const timestamp = {
  type: 'timestamp',
  constraints: [],
  build: () => z.iso.datetime({ offset: true }),
} as const
