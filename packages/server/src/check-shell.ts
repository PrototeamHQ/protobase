import { navRecentErrors, type UserMenuModel, type ViewModel } from '@protobase/schema'
import type { Registry } from './registry'

/** Fails at startup when a sidebar group or a user menu entry does not fit the resources, instead of on the first page load. */
export const checkShell = (registry: Registry, views: ViewModel[], userMenu: UserMenuModel | undefined, pages: readonly string[] = []) => {
  for (const view of views) {
    const entry = registry.find(view.resource)
    if (!entry || !view.nav?.recent) continue
    const errors = navRecentErrors(view.nav.recent, entry.model)
    if (errors.length > 0) throw new Error(`View "${view.resource}": nav.recent ${errors.join('; ')}`)
  }
  for (const item of userMenu?.items ?? []) {
    if (item.kind === 'resource' && !registry.find(item.resource)) throw new Error(`User menu: resource "${item.resource}" does not exist`)
    if (item.kind === 'page' && !pages.includes(item.page)) throw new Error(`User menu: page "${item.page}" does not exist`)
  }
}
