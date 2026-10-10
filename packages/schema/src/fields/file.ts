import { z } from 'zod'

/** A file column holds `{provider}:{path}?name=…&size=…` as text; writes send a ticket from `:upload` instead. */
export const file = { type: 'file', constraints: [], build: () => z.string().min(1).max(4096) } as const
