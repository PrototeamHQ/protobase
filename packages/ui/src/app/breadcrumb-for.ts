import { appPath } from '@protobase/schema'
import type { Crumb } from '../app-shell'
import type { CurrentAddress } from './current-address'
import { text as appText } from './messages'

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
  /** The open record's page draws no heading of its own, as a full-area record page does, so its crumb names it. */
  headingless?: boolean
  /** The open record's title. */
  recordTitle?: string
  /** The open record is still loading, so it has no title yet: its crumb is a skeleton rather than the raw key. */
  recordLoading?: boolean
}

/**
 * Group, then the page or resource list, then "New" on the create page: each with a page of its own links to it. A
 * record page's heading names the record, so its trail ends at the list it sits under; one without a heading ends with
 * the record.
 */
export const breadcrumbFor = ({ basePath, address, group, page, resourceLabel, headingless, recordTitle, recordLoading }: BreadcrumbInput): Crumb[] => {
  const groupCrumb = group ? [group] : []
  if (page) return [...groupCrumb, { label: page.title, href: appPath({ kind: 'page', page: page.name }, basePath) }]
  if (!address || address.kind === 'page') return [appText('admin')]
  const listHref = appPath({ kind: 'list', resource: address.resource, ...(address.kind === 'list' && address.list && { list: address.list }) }, basePath)
  const underHeading = address.kind === 'record' && !headingless
  const resource = resourceLabel ? [{ label: resourceLabel, href: listHref, ...(underHeading && { above: true }) }] : []
  if (address.kind === 'list' || underHeading) return [...groupCrumb, ...resource]
  const href = appPath(address, basePath)
  const record = address.kind === 'create' ? { label: appText('new'), href } : recordTitle === undefined && recordLoading ? { label: appText('loadingRecord'), href, loading: true } : { label: recordTitle ?? address.key, href }
  return [...groupCrumb, ...resource, record]
}
