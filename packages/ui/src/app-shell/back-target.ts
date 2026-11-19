import type { Crumb } from './breadcrumb'

/**
 * Where the mobile back button goes: the nearest page the current one sits under, the closest crumb before it with a
 * page of its own, past crumbs that name no page, such as a sidebar group. It is `shown` when that is the last crumb,
 * which a phone's trail then leaves to the button to show.
 */
export const backTarget = (parts: Crumb[]): { label: string; href: string; shown: boolean } | undefined => {
  const last = parts.at(-1)
  const shown = typeof last === 'object' && Boolean(last.above)
  const previous = shown ? last : parts.slice(0, -1).findLast((part) => typeof part === 'object' && Boolean(part.href))
  if (typeof previous !== 'object' || !previous.href || previous.loading) return undefined
  return { label: previous.label, href: previous.href, shown }
}
