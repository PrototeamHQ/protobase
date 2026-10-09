import { z } from 'zod'

export const json = { type: 'json', constraints: [], build: () => z.json() } as const
