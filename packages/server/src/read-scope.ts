import type { Scope } from '@protobase/query'
import { checkFilter, where, type CheckedFilter, type ResourceModel } from '@protobase/schema'
import { andFilters, ownScope, requestAccess, trusted, type RequestAccess } from './request-access'
import type { Membership, Session, TenantValue } from './types'

/** A tenant a list reads, with the read row filter of the caller's access there. */
type TenantRead = { tenant: TenantValue; rowFilter?: CheckedFilter }

const sameTenant = (a: TenantValue, b: TenantValue) => String(a) === String(b)

// The person as a member of another tenant: the same user, with the roles they act with there.
const memberSession = (session: Session, membership: Membership): Session => ({
  ...session,
  user: { ...session.user, roles: membership.roles },
  tenant: membership.tenant,
  ...(session.organization && { organization: { id: membership.tenant } }),
})

// A tenant joins the list only when the person's access there lists the resource and reads every field their own
// access lists, so the list shows no field their role there hides.
const listsAsMuch = (own: RequestAccess, other: RequestAccess) =>
  other.resolved.operations.list && Object.keys(own.model.fields).every((name) => Object.hasOwn(other.model.fields, name))

// The other tenants a list of an `across` resource reads: those the person is a member of, each read as their access
// there allows. None when the caller cannot see the tenant field, which `restrictModel` then drops with `tenantAcross`.
const otherTenants = async (access: RequestAccess): Promise<TenantRead[]> => {
  const { deps, entry, session } = access
  const own = session.tenant
  if (!access.model.tenantAcross || own === undefined || !session.memberships) return []
  const memberships = new Map((await session.memberships()).filter((membership) => !sameTenant(membership.tenant, own)).map((membership) => [String(membership.tenant), membership]))
  const reads = await Promise.all([...memberships.values()].map(async (membership) => {
    const other = await requestAccess(deps, entry, memberSession(session, membership))
    return listsAsMuch(access, other) ? [{ tenant: membership.tenant, rowFilter: other.resolved.rowFilter.read }] : []
  }))
  return reads.flat()
}

// Ties each tenant to its own row filter, `(tenant = a AND filter of a) OR tenant = b OR ...`; none when no tenant has one.
const acrossFilter = (full: ResourceModel, reads: TenantRead[]): CheckedFilter | undefined => {
  if (reads.every((read) => read.rowFilter === undefined)) return undefined
  const tenantIs = (value: TenantValue) => {
    const checked = checkFilter(trusted(full), where.eq(full.tenant!, value as string))
    if (!checked.ok) throw new Error(`The tenant ${value} of "${full.name}" does not make a filter: ${checked.errors[0]!.message}`)
    return checked.filter
  }
  return { kind: 'or', args: reads.map((read) => andFilters([tenantIs(read.tenant), read.rowFilter])!), span: { start: 0, end: 0 } }
}

/**
 * The query-layer scope of a list-style read (a list, its counts, facets, charts and map, and the labels and photos it
 * brings): the caller's own tenant, or for a resource whose lists read across tenants (`tenantAcross`) also every other
 * tenant the person is a member of, each with the row filter of their access there.
 */
export const readScope = async (access: RequestAccess, fullModel: ResourceModel = access.full): Promise<Scope> => {
  const own = ownScope(access, fullModel)
  const others = await otherTenants(access)
  if (others.length === 0) return own
  const reads = [{ tenant: own.tenantValue!, rowFilter: own.rowFilter }, ...others]
  const rowFilter = acrossFilter(fullModel, reads)
  return { tenantValues: reads.map((read) => read.tenant), ...(rowFilter && { rowFilter }), fullModel }
}
