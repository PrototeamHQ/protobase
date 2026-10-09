import { z } from 'zod'

export const date = { type: 'date', constraints: [], build: () => z.iso.date() } as const
