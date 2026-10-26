import type { Db } from '../../db/connection'
import { ticketAt } from '../builders/ticket'
import { tenanciesOf } from '../builders/allocation'
import { DAY, windowEnd, windowStart } from '../calendar'
import { copyRows } from '../copy'
import { iso, isoDate, money, row } from '../format'
import { int, pick, rngAt, weighted } from '../rng'
import type { World } from '../world'
import { unitsOf } from './portfolio'

function* vendorRows(world: World) {
  const createdAt = iso(windowStart - 2 * 365 * DAY)
  for (const org of world.orgs) {
    for (const vendor of org.vendors) {
      const domain = `${vendor.name.toLowerCase().replace(/[^a-z]+/g, '')}.nl`
      const rand = rngAt(org.seed + 16, vendor.id)
      yield row(vendor.id, org.id, vendor.name, vendor.trade, `planning@${domain}`, `+31 ${int(rand, 10, 79)} ${int(rand, 1_000_000, 9_999_999)}`, money(vendor.rate * 100), true, createdAt, createdAt)
    }
  }
}

function* ticketRows(world: World) {
  for (const org of world.orgs) {
    for (let ordinal = 0; ordinal < org.ticketCount; ordinal++) {
      const t = ticketAt(org, ordinal)
      yield row(t.id, org.id, t.number, t.propertyId, t.unitId, t.reportedBy, t.assignedTo, t.category, t.priority, t.status, t.title, t.description, iso(t.reportedAt), t.closedAt === null ? null : iso(t.closedAt), iso(t.reportedAt), iso(t.updatedAt))
    }
  }
}

function* workOrderRows(world: World) {
  let id = 1
  for (const org of world.orgs) {
    for (let ordinal = 0; ordinal < org.ticketCount; ordinal++) {
      const ticket = ticketAt(org, ordinal)
      for (const w of ticket.workOrders) {
        const updatedAt = w.completedOn === null ? w.createdAt : Math.min(w.completedOn + 18 * 3_600_000, windowEnd)
        yield row(id++, org.id, ticket.id, w.vendorId, isoDate(w.scheduledFor), w.completedOn === null ? null : isoDate(w.completedOn), w.hours?.toFixed(2) ?? null, w.costCents === null ? null : money(w.costCents), w.notes, iso(w.createdAt), iso(updatedAt))
      }
    }
  }
}

const notes = { good: [null, 'Clean and complete.', 'Meter readings taken.'], fair: ['Wear on the floor in the living room.', 'Walls need painting.', 'Small damage to the kitchen worktop.'], poor: ['Holes in the walls, floor damaged.', 'Mould in the bathroom, needs treatment.', 'Garden neglected, rubbish left behind.'] } as const

// A move-in inspection for every lease that starts in the window, a move-out for every one that ends in it, and now
// and then a periodic one.
function* inspectionRows(world: World) {
  let id = 1
  for (const org of world.orgs) {
    for (const { property, unit, ordinal } of unitsOf(org)) {
      const rand = rngAt(org.seed + 17, ordinal)
      const inspection = (leaseId: number | null, kind: 'move_in' | 'move_out' | 'periodic', on: number, condition: 'good' | 'fair' | 'poor') => {
        const recordedAt = Math.min(on + int(rand, 10, 17) * 3_600_000, windowEnd)
        return row(id++, org.id, unit.id, leaseId, pick(rand, org.inspectors).id, kind, isoDate(on), condition, pick(rand, notes[condition]), iso(recordedAt), iso(recordedAt))
      }
      const tenancies = tenanciesOf(org.seed, ordinal, property.createdAt)
      for (const [index, tenancy] of tenancies.entries()) {
        const leaseId = org.leaseFirstId + org.leaseStarts[ordinal]! + index
        const moveIn = tenancy.start - int(rand, 0, 2) * DAY
        if (moveIn >= windowStart && moveIn <= windowEnd) yield inspection(leaseId, 'move_in', moveIn, weighted(rand, [['good', 80], ['fair', 18], ['poor', 2]] as const))
        if (tenancy.end !== null && tenancy.end >= windowStart && tenancy.end <= windowEnd) yield inspection(leaseId, 'move_out', tenancy.end, weighted(rand, [['good', 45], ['fair', 40], ['poor', 15]] as const))
      }
      if (rand() < 0.3) {
        const on = Math.floor((Math.max(windowStart, property.createdAt) + rand() * (windowEnd - Math.max(windowStart, property.createdAt))) / DAY) * DAY
        yield inspection(null, 'periodic', on, weighted(rand, [['good', 70], ['fair', 25], ['poor', 5]] as const))
      }
    }
  }
}

export const seedMaintenance = async (sql: Db, world: World) => {
  await copyRows(sql, 'maintenance.vendors (id, organization_id, name, trade, email, phone, hourly_rate, active, created_at, updated_at)', vendorRows(world))
  await copyRows(sql, 'maintenance.tickets (id, organization_id, number, property_id, unit_id, reported_by, assigned_to, category, priority, status, title, description, reported_at, closed_at, created_at, updated_at)', ticketRows(world))
  await copyRows(sql, 'maintenance.work_orders (id, organization_id, ticket_id, vendor_id, scheduled_for, completed_on, hours, cost, notes, created_at, updated_at)', workOrderRows(world))
  await copyRows(sql, 'maintenance.inspections (id, organization_id, unit_id, lease_id, inspector_id, kind, inspected_on, condition, notes, created_at, updated_at)', inspectionRows(world))
}
