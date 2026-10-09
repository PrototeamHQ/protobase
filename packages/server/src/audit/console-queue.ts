import type { AuditEvent, AuditQueue } from '../types'

/** The stand-in queue: prints each event as one JSON line, so nothing is kept. */
export const consoleAuditQueue = (print: (line: string) => void = console.info): AuditQueue => ({
  publish: async (event: AuditEvent) => print(`[audit] ${JSON.stringify(event)}`),
})
