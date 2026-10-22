import type { MetaData } from './meta-data'

/**
 * The `/meta` the page keeps after reading it again: `next`, unless the server now runs another Protobase version than
 * the page started with. The page then keeps the `/meta` it has, marked with the version the server moved to, and
 * `useMeta` stops reading it, so nothing on the page changes until it is reloaded.
 */
export const keepOnVersionChange = (previous: MetaData | undefined, next: MetaData): MetaData => {
  if (!previous) return next
  if (previous.versionChange) return previous
  if (next.protobaseVersion === previous.protobaseVersion) return next
  return { ...previous, versionChange: { ...(next.protobaseVersion && { to: next.protobaseVersion }) } }
}
