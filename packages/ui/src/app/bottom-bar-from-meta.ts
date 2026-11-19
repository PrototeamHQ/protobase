import { ExternalLink, LayoutDashboard } from 'lucide-react'
import { appPath } from '@protobase/schema'
import type { BottomBarTab } from '../app-shell'
import type { MetaData } from '../data/meta-data'
import { menuIcon, resourceIcon } from './menu-icons'

/**
 * The bottom bar's tabs from `/meta`: resources and pages open in the app (active while open, and shown while open on
 * its own page, `onItsPage`, not one under it such as a record), links open a new tab.
 * Search is no tab here: `bottomBarSearch` tells whether the bar has it.
 */
export const bottomBarFromMeta = (meta: MetaData, basePath: string, activeResource: string | undefined, onItsPage = false): BottomBarTab[] =>
  (meta.bottomBar?.items ?? []).flatMap((item, index): BottomBarTab[] => {
    if (item.kind === 'search') return []
    if (item.kind === 'link') return [{ id: `link-${index}`, label: item.label, icon: menuIcon(item.icon, ExternalLink), href: item.href, external: true }]
    if (item.kind === 'page') return [{ id: item.page, label: item.label, icon: menuIcon(item.icon ?? meta.pages[item.page]?.icon, LayoutDashboard), href: appPath({ kind: 'page', page: item.page }, basePath), active: item.page === activeResource, shown: onItsPage && item.page === activeResource }]
    return [{ id: item.resource, label: item.label, icon: menuIcon(item.icon, resourceIcon(meta, item.resource)), href: appPath({ kind: 'list', resource: item.resource }, basePath), active: item.resource === activeResource, shown: onItsPage && item.resource === activeResource }]
  })

/** The bottom bar's search, when the app put it there (`m.search`): its label, or `true` for the default one; else none. */
export const bottomBarSearch = (meta: MetaData): string | true | undefined => {
  const item = meta.bottomBar?.items.find((candidate) => candidate.kind === 'search')
  return item?.kind === 'search' ? (item.label ?? true) : undefined
}
