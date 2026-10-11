import { ExternalLink, LayoutDashboard } from 'lucide-react'
import { appPath } from '@protobase/schema'
import type { BottomBarTab } from '../app-shell'
import type { MetaData } from '../data/meta-data'
import { iconFor } from './icons'
import { menuIcon } from './menu-icons'

/** The bottom bar's tabs from `/meta`: resources and pages open in the app (active while open), links open a new tab. */
export const bottomBarFromMeta = (meta: MetaData, basePath: string, activeResource: string | undefined): BottomBarTab[] =>
  (meta.bottomBar?.items ?? []).map((item, index) => {
    if (item.kind === 'link') return { id: `link-${index}`, label: item.label, icon: menuIcon(item.icon, ExternalLink), href: item.href, external: true }
    if (item.kind === 'page') return { id: item.page, label: item.label, icon: menuIcon(item.icon ?? meta.pages[item.page]?.icon, LayoutDashboard), href: appPath({ kind: 'page', page: item.page }, basePath), active: item.page === activeResource }
    return { id: item.resource, label: item.label, icon: menuIcon(item.icon, iconFor(item.resource)), href: appPath({ kind: 'list', resource: item.resource }, basePath), active: item.resource === activeResource }
  })
