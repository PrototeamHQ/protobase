import type { Signer } from './signer'
import { formatUri, parseUri, type FileRef } from './uri'

/** Who may use a ticket: the uploader, in their tenant, for one field of one resource. */
export type TicketScope = { tenant: string; resource: string; field: string; user: string }

export type Derived = Record<string, unknown>

const sortedEntries = (derived: Derived) => Object.entries(derived).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

const parts = (uri: string, derived: Derived, scope: TicketScope, expires: number) =>
  [uri, sortedEntries(derived), scope.tenant, scope.resource, scope.field, scope.user, expires]

/**
 * What `:upload` answers with, and what a write sends back: the file's URI with its derived values, an expiry (Unix
 * seconds) and a signature over them and the scope, so it works only for that uploader, tenant, resource and field.
 */
export const issueTicket = async (signer: Signer, ref: FileRef, derived: Derived, scope: TicketScope, expires: number) => {
  const uri = formatUri(ref)
  const extra = new URLSearchParams([
    ...sortedEntries(derived).map(([column, value]): [string, string] => [`d.${column}`, JSON.stringify(value)]),
    ['exp', String(expires)],
    ['sig', await signer.sign('ticket', parts(uri, derived, scope, expires))],
  ])
  return `${uri}&${extra}`
}

export type TicketCheck = { ok: true; uri: string; ref: FileRef; derived: Derived } | { ok: false; reason: 'not-a-ticket' | 'invalid' | 'expired' }

const parseJson = (text: string): { value: unknown } | undefined => {
  try {
    return { value: JSON.parse(text) }
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

/** The clean URI and derived values of a ticket that verifies for `scope` and has not expired at `now` (Unix seconds). */
export const readTicket = async (signer: Signer, value: string, scope: TicketScope, now: number): Promise<TicketCheck> => {
  const query = new URLSearchParams(value.slice(value.indexOf('?') + 1))
  const signature = query.get('sig')
  if (!value.includes('?') || signature === null) return { ok: false, reason: 'not-a-ticket' }
  const derived: Derived = {}
  for (const [name, text] of query) {
    if (!name.startsWith('d.')) continue
    const parsed = parseJson(text)
    if (!parsed) return { ok: false, reason: 'invalid' }
    derived[name.slice(2)] = parsed.value
  }
  const known = new Set(['name', 'size', 'exp', 'sig'])
  if ([...query.keys()].some((name) => !known.has(name) && !name.startsWith('d.'))) return { ok: false, reason: 'invalid' }
  const parsed = parseUri(value.slice(0, value.indexOf('?')) + `?${new URLSearchParams({ name: query.get('name') ?? '', size: query.get('size') ?? '' })}`)
  const expires = Number(query.get('exp'))
  if (!parsed || parsed.size === undefined || !Number.isSafeInteger(expires)) return { ok: false, reason: 'invalid' }
  const uri = formatUri(parsed)
  if (!(await signer.verify('ticket', parts(uri, derived, scope, expires), signature))) return { ok: false, reason: 'invalid' }
  if (expires < now) return { ok: false, reason: 'expired' }
  return { ok: true, uri, ref: parsed, derived }
}
