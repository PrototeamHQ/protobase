import type { Crumb } from './breadcrumb'

/** Where the mobile back button goes: the page the current one sits under, when that crumb has a page of its own. */
export const backTarget = (parts: Crumb[]): { label: string; href: string } | undefined => {
  const last = parts.at(-1)
  const previous = typeof last === 'object' && last.above ? last : parts.at(-2)
  if (typeof previous !== 'object' || !previous.href || previous.loading) return undefined
  return { label: previous.label, href: previous.href }
}
