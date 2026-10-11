import { appPath } from '@protobase/schema'
import type { Crumb } from '../app-shell'
import type { CurrentAddress } from './current-address'

export type BreadcrumbInput = {
  basePath: string
  /** The address the app shows; none at the root. */
  address: CurrentAddress | undefined
  /** The sidebar group the page sits in; it has no page of its own, so it stays text. */
  group?: string
  /** The composed page being shown, when the address is one. */
  page?: { name: string; title: string }
  /** The resource's plural name, for example "Tenants". */
  resourceLabel?: string
  /** The open record's title. */
  recordTitle?: string
}

/** Group, then the page or resource list, then the record (or "New"): each with a page of its own links to it. */
export const breadcrumbFor = ({ basePath, address, group, page, resourceLabel, recordTitle }: BreadcrumbInput): Crumb[] => {
  const groupCrumb = group ? [group] : []
  if (page) return [...groupCrumb, { label: page.title, href: appPath({ kind: 'page', page: page.name }, basePath) }]
  if (!address || address.kind === 'page') return ['Admin']
  const resource = resourceLabel ? [{ label: resourceLabel, href: appPath({ kind: 'list', resource: address.resource }, basePath) }] : []
  if (address.kind === 'list') return [...groupCrumb, ...resource]
  const record = address.kind === 'create' ? { label: 'New', href: appPath(address, basePath) } : { label: recordTitle ?? address.key, href: appPath(address, basePath) }
  return [...groupCrumb, ...resource, record]
}
