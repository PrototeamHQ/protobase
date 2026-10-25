import { parseFilter, printFilter, where, type NavModel, type ViewModel } from '@protobase/schema'
import type { TenantValue } from './types'

// The filter narrowed to `field = tenant`, printed as the person could have typed it.
const narrowed = (filter: string | undefined, field: string, tenant: TenantValue) => {
  const term = where.eq(field, tenant as string)
  const parsed = filter?.trim() ? parseFilter(filter) : undefined
  if (parsed && !parsed.ok) throw new Error(`The filter "${filter}" does not parse: ${parsed.errors[0]!.message}`)
  return printFilter(parsed?.ast ? where.and(parsed.ast, term) : term)
}

type Entry = Pick<ViewModel, 'nav' | 'list'>

const onTenant = <E extends Entry>(entry: E, field: string, tenant: TenantValue): E => {
  if (entry.nav?.tenant !== 'current' || !entry.list) return entry
  const recent = entry.nav.recent && { ...entry.nav.recent, filter: narrowed(entry.nav.recent.filter, field, tenant) }
  const nav: NavModel = { ...entry.nav, ...(recent && { recent }) }
  return { ...entry, nav, list: { ...entry.list, filter: narrowed(entry.list.filter, field, tenant) } }
}

/**
 * The view as `/meta` gives it to a caller in `tenant`: each entry whose `nav.tenant` is `current`, the view's own and
 * its named lists', opens its list on that tenant, with `tenantField = "<tenant>"` added to the list's opening filter
 * and its recent records' filter. Unchanged for a caller who cannot see the tenant field, or works in no tenant.
 */
export const withCurrentTenant = (view: ViewModel, tenantField: string | undefined, tenant: TenantValue | undefined): ViewModel => {
  if (tenantField === undefined || tenant === undefined) return view
  const own = onTenant(view, tenantField, tenant)
  return own.lists ? { ...own, lists: own.lists.map((list) => onTenant(list, tenantField, tenant)) } : own
}
