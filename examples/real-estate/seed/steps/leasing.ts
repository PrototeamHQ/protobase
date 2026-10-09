import type { Db } from '../../db/connection'
import { tenanciesOf } from '../builders/allocation'
import { depositFor, leaseAt, tenantsOf, type SeededLease } from '../builders/tenancy'
import { copyRows } from '../copy'
import { iso, isoDate, money, row } from '../format'
import type { Org, World } from '../world'
import { unitsOf } from './portfolio'

// Every lease of the organization, in lease order (unit by unit, oldest first).
export function* leasesOf(org: Org): Generator<SeededLease> {
  for (const { property, unit, ordinal } of unitsOf(org)) {
    const tenancies = tenanciesOf(org.seed, ordinal, property.createdAt)
    for (const [index, tenancy] of tenancies.entries()) yield leaseAt(org, property, unit, ordinal, index, tenancy)
  }
}

function* leaseRows(world: World) {
  for (const org of world.orgs) {
    for (const lease of leasesOf(org)) {
      const { start, end, term } = lease.tenancy
      yield row(lease.id, org.id, lease.number, lease.unitId, term, isoDate(start), end === null ? null : isoDate(end), money(lease.rentCents), money(lease.serviceCents), lease.notice === null ? null : isoDate(lease.notice), iso(lease.createdAt), iso(lease.updatedAt))
    }
  }
}

function* tenantRows(world: World) {
  for (const org of world.orgs) {
    for (const lease of leasesOf(org)) {
      for (const t of tenantsOf(org, lease)) {
        yield row(t.id, org.id, t.firstName, t.lastName, t.email, t.phone, isoDate(t.dateOfBirth), t.iban, money(t.incomeCents), iso(t.createdAt), iso(t.createdAt))
      }
    }
  }
}

function* leaseTenantRows(world: World) {
  for (const org of world.orgs) {
    for (const lease of leasesOf(org)) {
      for (const tenant of tenantsOf(org, lease)) yield row(lease.id, tenant.id, org.id, tenant.role, iso(lease.createdAt))
    }
  }
}

// One deposit per lease, so it takes the lease's id.
function* depositRows(world: World) {
  for (const org of world.orgs) {
    for (const lease of leasesOf(org)) {
      const d = depositFor(org, lease)
      const updatedAt = d.returnedOn ?? d.receivedOn
      yield row(lease.id, org.id, lease.id, money(d.amountCents), isoDate(d.receivedOn), d.status, money(d.returnedCents), d.returnedOn === null ? null : isoDate(d.returnedOn), iso(d.receivedOn), iso(updatedAt))
    }
  }
}

export const seedLeasing = async (sql: Db, world: World) => {
  await copyRows(sql, 'leasing.leases (id, organization_id, number, unit_id, term, start_date, end_date, monthly_rent, service_costs, notice_given_on, created_at, updated_at)', leaseRows(world))
  await copyRows(sql, 'leasing.tenants (id, organization_id, first_name, last_name, email, phone, date_of_birth, iban, monthly_income, created_at, updated_at)', tenantRows(world))
  await copyRows(sql, 'leasing.lease_tenants (lease_id, tenant_id, organization_id, role, added_at)', leaseTenantRows(world))
  await copyRows(sql, 'leasing.deposits (id, organization_id, lease_id, amount, received_on, status, returned_amount, returned_on, created_at, updated_at)', depositRows(world))
}
