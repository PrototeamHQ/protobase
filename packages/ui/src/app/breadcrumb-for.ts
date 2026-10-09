import type { Crumb } from '../app-shell'
import type { Route } from './router'

export type BreadcrumbInput = {
  basePath: string
  route: Route
  /** The sidebar group the page sits in; it has no page of its own, so it stays text. */
  group?: string
  /** The composed page being shown, when the route is one. */
  page?: { name: string; title: string }
  /** The resource's plural name, for example "Tenants". */
  resourceLabel?: string
  /** The open record's title. */
  recordTitle?: string
}

/** Group, then the page or resource list, then the record (or "New"): each with a page of its own links to it. */
export const breadcrumbFor = ({ basePath, route, group, page, resourceLabel, recordTitle }: BreadcrumbInput): Crumb[] => {
  const groupCrumb = group ? [group] : []
  if (page) return [...groupCrumb, { label: page.title, href: `${basePath}/${page.name}` }]
  if (!route.resource) return ['Admin']
  const list = `${basePath}/${route.resource}`
  const resource = resourceLabel ? [{ label: resourceLabel, href: list }] : []
  if (!route.key) return [...groupCrumb, ...resource]
  const record = { label: route.key === 'new' ? 'New' : (recordTitle ?? route.key), href: `${list}/${encodeURIComponent(route.key)}` }
  return [...groupCrumb, ...resource, record]
}
