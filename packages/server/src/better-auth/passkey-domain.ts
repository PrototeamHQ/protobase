import type { DBAdapter } from 'better-auth'
import { exists } from './store/store-reads'

// Any store's adapter: only its `findMany` is used.
type Finder = Pick<DBAdapter, 'findMany'>

export const passkeyDomainVariable = 'PROTOBASE_PASSKEY_DOMAIN'

/** The passkey domain the platform passes in `PROTOBASE_PASSKEY_DOMAIN`; `undefined` when it is unset. */
export const readPasskeyDomain = (env: Record<string, string | undefined>) => env[passkeyDomainVariable]?.trim() || undefined

/** The host names of the app's origins, which are the RP IDs its passkeys can have, without repeats. */
export const passkeyHosts = (origins: string[]) => [...new Set(origins.map((origin) => new URL(origin).hostname))]

/**
 * The RP ID new passkeys get: `domain` when given, which must be the host of one of the app's origins, and otherwise
 * the host of the first, `baseURL`'s.
 */
export const resolvePasskeyDomain = (domain: string | undefined, origins: string[]) => {
  const hosts = passkeyHosts(origins)
  if (domain === undefined) return hosts[0]!
  const host = domain.toLowerCase()
  if (!hosts.includes(host)) throw new Error(`The passkey domain "${domain}" must be the host of one of the app's origins: ${hosts.join(', ')}`)
  return host
}

/**
 * The RP IDs a passkey sign-in may ask the browser for, which asks for one at a time: the passkey domain, then each
 * other host of the app that a passkey was made for (passkeys made before they kept their RP ID count for the host of
 * `baseURL`, the first). On one origin that is the passkey domain alone, read without a query.
 */
export const signInPasskeyDomains = async (adapter: Finder, domain: string, origins: string[]) => {
  const hosts = passkeyHosts(origins)
  const others = hosts.filter((host) => host !== domain)
  if (others.length === 0) return [domain]
  const held = await Promise.all(
    others.map((host) => {
      const values = host === hosts[0] ? [host, null] : [host]
      return exists(adapter, 'passkey', values.map((value) => ({ field: 'rpID', value, connector: 'OR' as const })))
    }),
  )
  return [domain, ...others.filter((_, index) => held[index])]
}
