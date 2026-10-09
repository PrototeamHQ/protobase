import { z } from 'zod'

export const uuid = { type: 'uuid', constraints: [], build: () => z.uuid() } as const
