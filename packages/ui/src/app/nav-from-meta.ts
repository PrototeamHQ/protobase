import type { NavGroup, NavRecent } from '../app-shell'
import type { MetaData } from '../data/meta-data'
import { humanize } from '../live/naming'
import { LayoutDashboard } from 'lucide-react'
import { iconFor } from './icons'
import { menuIcon } from './menu-icons'
import { userMenuResources } from './user-menu-from-meta'

const groupLabels: Record<string, string> = { sales: 'Sales', crm: 'CRM', catalog: 'Catalog', inventory: 'Inventory', core: 'Admin', hr: 'HR' }

/**
 * One sidebar group per `nav.group` (default: the database schema, and "Pages" for pages); `nav.hidden` and a place in
 * the user menu leave an entry out, `nav.order` sorts within a group, and `recent` (from `useNavRecent`) makes an entry
 * collapsible. Groups with pages come first, so a dashboard leads the sidebar.
 */
export const navFromMeta = (meta: MetaData, basePath = '', recent: Record<string, NavRecent> = {}): NavGroup[] => {
  const groups = new Map<string, NavGroup>()
  const orders = new Map<string, number>()
  const inMenu = userMenuResources(meta)
  for (const page of Object.values(meta.pages)) {
    if (page.nav?.hidden || inMenu.has(page.name)) continue
    const groupName = page.nav?.group ?? 'Pages'
    const group = groups.get(groupName) ?? { label: groupName, items: [] }
    group.items.push({ id: page.name, label: page.title, icon: menuIcon(page.icon, LayoutDashboard), href: `${basePath}/${page.name}` })
    groups.set(groupName, group)
    orders.set(page.name, page.nav?.order ?? Number.MAX_SAFE_INTEGER)
  }
  for (const model of Object.values(meta.resources)) {
    const view = meta.views[model.name]
    if (!view || view.nav?.hidden || inMenu.has(model.name)) continue
    const schema = model.table.schema ?? 'public'
    const groupName = view.nav?.group ?? groupLabels[schema] ?? humanize(schema)
    const group = groups.get(groupName) ?? { label: groupName, items: [] }
    group.items.push({
      id: model.name,
      label: view.names?.plural ?? humanize(model.name),
      icon: iconFor(model.name),
      href: `${basePath}/${model.name}`,
      ...(recent[model.name] && { recent: recent[model.name] }),
    })
    groups.set(groupName, group)
    orders.set(model.name, view.nav?.order ?? Number.MAX_SAFE_INTEGER)
  }
  return [...groups.values()].map((group) => ({ ...group, items: [...group.items].sort((a, b) => (orders.get(a.id) ?? 0) - (orders.get(b.id) ?? 0)) }))
}
