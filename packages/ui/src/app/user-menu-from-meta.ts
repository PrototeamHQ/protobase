import { ExternalLink, LayoutDashboard } from 'lucide-react'
import { appPath } from '@protobase/schema'
import type { ProfileMenuItem } from '../app-shell'
import type { MetaData } from '../data/meta-data'
import { humanize } from '../live/naming'
import { menuIcon, resourceIcon } from './menu-icons'

/** The resources and pages the user menu holds; the sidebar leaves them out. */
export const userMenuResources = (meta: MetaData) =>
  new Set((meta.userMenu?.items ?? []).flatMap((item) => (item.kind === 'resource' ? [item.resource] : item.kind === 'page' ? [item.page] : [])))

/** The profile menu's items from `/meta`: resources and pages open in the app (marked active while open), links open a new tab. */
export const userMenuFromMeta = (meta: MetaData, basePath: string, activeResource: string | undefined): ProfileMenuItem[] =>
  (meta.userMenu?.items ?? []).map((item, index) => {
    if (item.kind === 'link') return { id: `link-${index}`, label: item.label, icon: menuIcon(item.icon, ExternalLink), href: item.href, external: true }
    if (item.kind === 'page') {
      const page = meta.pages[item.page]
      return { id: item.page, label: item.label ?? page?.title ?? humanize(item.page), icon: menuIcon(item.icon ?? page?.icon, LayoutDashboard), href: appPath({ kind: 'page', page: item.page }, basePath), active: item.page === activeResource }
    }
    return {
      id: item.resource,
      label: item.label ?? meta.views[item.resource]?.names?.plural ?? humanize(item.resource),
      icon: menuIcon(item.icon, resourceIcon(meta, item.resource)),
      href: appPath({ kind: 'list', resource: item.resource }, basePath),
      active: item.resource === activeResource,
    }
  })
