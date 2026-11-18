import type { BetterAuthPlugin } from 'better-auth'
import type { ResolvedNames } from './resolve-names'

/** Better Auth's context, with the store's names the plugin below puts on it. */
export type NamedContext = { storeNames: ResolvedNames }

/** Puts the store's resolved names on Better Auth's context, where the store's own SQL reads them (`storeSqlOf`). */
export const storeNamesPlugin = (names: ResolvedNames) => ({ id: 'protobase-store-names', init: () => ({ context: { storeNames: names } }) }) satisfies BetterAuthPlugin

/** The store's names on Better Auth's context. */
export const namesOf = (context: object) => {
  const names = (context as Partial<NamedContext>).storeNames
  if (!names) throw new Error("Better Auth's context has no store names: the auth instance was made without storeNamesPlugin")
  return names
}
