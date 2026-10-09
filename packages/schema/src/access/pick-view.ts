import type { ViewModel } from '../model'

/**
 * Picks the view for a user: the first role-specific view whose roles intersect the user's,
 * otherwise the default view (one without roles). With `resource`, only that resource's views count.
 */
export const pickView = (views: readonly ViewModel[], roles: readonly string[], resource?: string) => {
  const candidates = resource === undefined ? views : views.filter((view) => view.resource === resource)
  const specific = candidates.find((view) => view.roles?.some((role) => roles.includes(role)))
  return specific ?? candidates.find((view) => !view.roles?.length)
}
