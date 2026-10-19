import { appPath } from '@protobase/schema'
import type { NavGroup, NavRecent } from '../app-shell'
import type { MetaData } from '../data/meta-data'
import { humanize } from '../live/naming'
import { LayoutDashboard } from 'lucide-react'
import { iconFor } from './icons'
import { menuIcon } from './menu-icons'
import { userMenuResources } from './user-menu-from-meta'
import { text as appText } from './messages'

/** The sidebar item of a resource's list, or of one of its named lists. */
export const navItemId = (resource: string, list?: string) => (list === undefined ? resource : `${resource}/${list}`)

const groupLabels: Record<string, 'sales' | 'crm' | 'catalog' | 'inventory' | 'admin' | 'hr'> = { sales: 'sales', crm: 'crm', catalog: 'catalog', inventory: 'inventory', core: 'admin', hr: 'hr' }

/**
 * One sidebar group per `nav.group` (default: the database schema, and "Pages" for pages); `nav.hidden` and a place in
 * the user menu leave an entry out, `nav.order` sorts within a group, and `recent` (from `useNavRecent`) makes an entry
 * collapsible. Groups with pages come first, so a dashboard leads the sidebar. The resources of a source that cannot be
 * read are listed under its label, each with the problem. A visitor also gets the resources whose views ask them to sign
 * in, where those views place them, under "Account" without a group. Each named list of a view is an entry of its
 * own, placed by its own `nav`.
 */
export const navFromMeta = (meta: MetaData, basePath = '', recent: Record<string, NavRecent> = {}): NavGroup[] => {
  const groups = new Map<string, NavGroup>()
  const orders = new Map<string, number>()
  const inMenu = userMenuResources(meta)
  for (const page of Object.values(meta.pages)) {
    if (page.nav?.hidden || inMenu.has(page.name)) continue
    const groupName = page.nav?.group ?? appText('pages')
    const group = groups.get(groupName) ?? { label: groupName, items: [] }
    group.items.push({ id: page.name, label: page.title, icon: menuIcon(page.icon, LayoutDashboard), href: appPath({ kind: 'page', page: page.name }, basePath) })
    groups.set(groupName, group)
    orders.set(page.name, page.nav?.order ?? Number.MAX_SAFE_INTEGER)
  }
  for (const model of Object.values(meta.resources)) {
    const view = meta.views[model.name]
    if (!view || inMenu.has(model.name)) continue
    const schema = model.table.schema ?? 'public'
    const defaultGroup = view.nav?.group ?? (groupLabels[schema] ? appText(groupLabels[schema]) : humanize(schema))
    const add = (groupName: string, item: NavGroup['items'][number], order: number | undefined) => {
      const group = groups.get(groupName) ?? { label: groupName, items: [] }
      group.items.push(item)
      groups.set(groupName, group)
      orders.set(item.id, order ?? Number.MAX_SAFE_INTEGER)
    }
    if (!view.nav?.hidden) {
      add(
        defaultGroup,
        {
          id: navItemId(model.name),
          label: view.names?.plural ?? humanize(model.name),
          icon: iconFor(model.name),
          href: appPath({ kind: 'list', resource: model.name }, basePath),
          ...(recent[model.name] && { recent: recent[model.name] }),
        },
        view.nav?.order,
      )
    }
    for (const named of view.lists ?? []) {
      if (named.nav?.hidden) continue
      add(
        named.nav?.group ?? defaultGroup,
        {
          id: navItemId(model.name, named.name),
          label: named.names.plural,
          icon: iconFor(model.name),
          href: appPath({ kind: 'list', resource: model.name, list: named.name }, basePath),
        },
        named.nav?.order,
      )
    }
  }
  // A visitor finds what signing in gives where a signed-in user finds the resource
  for (const entry of Object.values(meta.signIn ?? {})) {
    if (entry.nav?.hidden || inMenu.has(entry.resource)) continue
    const groupName = entry.nav?.group ?? appText('account')
    const group = groups.get(groupName) ?? { label: groupName, items: [] }
    group.items.push({ id: entry.resource, label: entry.names?.plural ?? humanize(entry.resource), icon: iconFor(entry.resource), href: appPath({ kind: 'list', resource: entry.resource }, basePath) })
    groups.set(groupName, group)
    orders.set(entry.resource, entry.nav?.order ?? Number.MAX_SAFE_INTEGER)
  }
  // A source that cannot be read keeps its resources in the sidebar, under its label and marked, so the person sees
  // what is missing and why; its own views place them once it answers.
  for (const status of meta.sources ?? []) {
    if (status.state !== 'error') continue
    const group = groups.get(status.source.label) ?? { label: status.source.label, items: [] }
    for (const resource of status.source.resources) {
      group.items.push({ id: resource, label: humanize(resource), icon: iconFor(resource), href: appPath({ kind: 'list', resource }, basePath), problem: appText('cannotReach', status.source.label) })
    }
    groups.set(status.source.label, group)
  }
  return [...groups.values()].map((group) => ({ ...group, items: [...group.items].sort((a, b) => (orders.get(a.id) ?? 0) - (orders.get(b.id) ?? 0)) }))
}
