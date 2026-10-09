import type { Deps } from '../deps'
import { notFound } from '../problem'

/** `orders` is the collection; `orders:facets` is a custom method (AIP-136). Resource names never contain a colon. */
export const resolveTarget = (deps: Deps, target: string) => {
  const colon = target.indexOf(':')
  const name = colon < 0 ? target : target.slice(0, colon)
  const entry = deps.registry.find(name)
  if (!entry) throw notFound(`There is no resource "${name}"`)
  return { entry, action: colon < 0 ? '' : target.slice(colon + 1) }
}

export const unknownAction = (action: string): never => {
  throw notFound(`There is no method ":${action}"`)
}
