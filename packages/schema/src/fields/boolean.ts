import { z } from 'zod'

export const boolean = { type: 'boolean', constraints: [], build: () => z.boolean() } as const
