import type { Crumb } from './breadcrumb'

/** Where the mobile back button goes: the crumb just before the current page, when it has a page of its own. */
export const backTarget = (parts: Crumb[]): { label: string; href: string } | undefined => {
  const previous = parts.at(-2)
  if (typeof previous !== 'object' || !previous.href || previous.loading) return undefined
  return { label: previous.label, href: previous.href }
}
