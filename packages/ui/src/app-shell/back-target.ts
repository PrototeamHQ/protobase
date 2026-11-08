import type { Crumb } from './breadcrumb'

/**
 * Where the mobile back button goes: the page the current one sits under, when that crumb has a page of its own. It is
 * `shown` when that is the last crumb, which a phone's trail then leaves to the button to show.
 */
export const backTarget = (parts: Crumb[]): { label: string; href: string; shown: boolean } | undefined => {
  const last = parts.at(-1)
  const shown = typeof last === 'object' && Boolean(last.above)
  const previous = shown ? last : parts.at(-2)
  if (typeof previous !== 'object' || !previous.href || previous.loading) return undefined
  return { label: previous.label, href: previous.href, shown }
}
