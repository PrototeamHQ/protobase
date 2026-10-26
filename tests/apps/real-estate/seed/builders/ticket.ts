import { DAY, windowEnd } from '../calendar'
import type { Trade } from '../data/reference'
import { int, pick, rngAt, weighted } from '../rng'
import type { Org } from '../world'
import { propertyAcquiredAt, propertyShapeAt, tenanciesOf } from './allocation'

const HOUR = 3_600_000

// What tenants report, the trade that fixes it, and a few ways they put it.
const categories = {
  heating: { weight: 20, trades: ['heating'], titles: ['Boiler shows an error code', 'No hot water', 'Radiators stay cold', 'Boiler pressure keeps dropping', 'Thermostat does not respond'] },
  plumbing: { weight: 18, trades: ['plumbing'], titles: ['Leaking tap in the kitchen', 'Toilet keeps running', 'Blocked drain in the shower', 'Low water pressure', 'Washing machine tap leaks'] },
  electrical: { weight: 9, trades: ['electrical'], titles: ['Group keeps tripping', 'Socket in the living room is dead', 'Doorbell broken', 'Extractor fan does not work'] },
  leak: { weight: 8, trades: ['roofing', 'plumbing'], titles: ['Water stain on the ceiling', 'Roof leaks after rain', 'Damp coming through the wall'] },
  mould: { weight: 7, trades: ['general'], titles: ['Mould in the bathroom', 'Black spots behind the wardrobe', 'Condensation on the windows'] },
  locks: { weight: 6, trades: ['locksmith'], titles: ['Front door lock is stiff', 'Locked out, key broken off', 'Storage room lock broken'] },
  appliances: { weight: 10, trades: ['electrical', 'general'], titles: ['Oven does not heat', 'Dishwasher leaks', 'Fridge is not cooling', 'Hob does not switch on'] },
  windows_doors: { weight: 10, trades: ['carpentry'], titles: ['Window does not close', 'Balcony door sticks', 'Draught along the window frame', 'Kitchen cabinet door came off'] },
  garden: { weight: 5, trades: ['general'], titles: ['Fence blown over', 'Shared garden overgrown', 'Tree branches over the path'] },
  pests: { weight: 7, trades: ['pest_control'], titles: ['Mice in the kitchen', 'Wasps nest under the roof', 'Bedbugs', 'Pigeons nesting on the balcony'] },
} satisfies Record<string, { weight: number; trades: Trade[]; titles: string[] }>

type Category = keyof typeof categories
const categoryEntries = Object.entries(categories).map(([name, spec]) => [name as Category, spec.weight] as const)

// Days from report to planning, and from planning to the visit, by priority.
const triageDays = { urgent: [0, 0], high: [0, 2], normal: [1, 5], low: [2, 10] } as const
const leadDays = { urgent: [0, 1], high: [1, 4], normal: [4, 14], low: [10, 35] } as const

// The vendors of the organization that do this trade, falling back to the handyman.
const vendorFor = (org: Org, category: Category, rand: () => number) => {
  const trade = pick(rand, categories[category].trades)
  const matching = org.vendors.filter((vendor) => vendor.trade === trade)
  return pick(rand, matching.length > 0 ? matching : org.vendors.filter((vendor) => vendor.trade === 'general'))
}

// A unit of a property that was already managed when the ticket came in.
const unitFor = (org: Org, reportedAt: number, rand: () => number) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const unit = int(rand, 0, org.unitCount - 1)
    if (propertyAcquiredAt(org.seed, org.unitProperty[unit]!) <= reportedAt) return unit
  }
  return int(rand, 0, org.unitCount - 1)
}

/**
 * A ticket and its work orders, rebuilt from its ordinal. Time decides the status: a ticket not planned by the window's
 * end is still reported, one whose last visit lies ahead is scheduled, the rest are done or (a few) cancelled.
 */
export const ticketAt = (org: Org, ordinal: number) => {
  const rand = rngAt(org.seed + 13, ordinal)
  const reportedAt = org.ticketTimes[ordinal]!
  const unit = unitFor(org, reportedAt, rand)
  const property = org.unitProperty[unit]!
  const category = weighted(rand, categoryEntries)
  const winter = [10, 11, 0, 1, 2].includes(new Date(reportedAt).getUTCMonth())
  const priority = category === 'heating' && winter && rand() < 0.5 ? 'urgent' : weighted(rand, [['urgent', 4], ['high', 18], ['normal', 58], ['low', 20]] as const)
  // Roofs, gardens and pests of a building are reported for the whole property.
  const wholeProperty = propertyShapeAt(org.seed, property).kind !== 'single_family' && ['leak', 'garden', 'pests'].includes(category) && rand() < 0.4

  const tenancies = tenanciesOf(org.seed, unit, propertyAcquiredAt(org.seed, property))
  const current = tenancies.findIndex((tenancy) => tenancy.start <= reportedAt && (tenancy.end === null || tenancy.end + DAY > reportedAt))
  const lease = current === -1 ? null : org.leaseStarts[unit]! + current
  const reportedBy = lease === null || rand() < 0.1 ? null : org.tenantFirstId + org.tenantStarts[lease]!

  const day = (ms: number) => Math.floor(ms / DAY) * DAY
  const [triageMin, triageMax] = triageDays[priority]
  const [leadMin, leadMax] = leadDays[priority]
  const plannedAt = reportedAt + int(rand, triageMin, triageMax) * DAY + int(rand, 1, 6) * HOUR
  const firstVisit = day(plannedAt) + int(rand, leadMin, leadMax) * DAY
  const visits = rand() < 0.15 ? [firstVisit, firstVisit + int(rand, 3, 14) * DAY] : [firstVisit]
  const cancelled = rand() < 0.06
  const cancelledAt = reportedAt + int(rand, 1, 10) * DAY + int(rand, 1, 8) * HOUR

  const status =
    cancelled && cancelledAt <= windowEnd ? 'cancelled'
    : cancelled || plannedAt > windowEnd ? 'reported'
    : visits.at(-1)! + 17 * HOUR > windowEnd ? 'scheduled'
    : 'done'
  const workOrders = status === 'scheduled' || status === 'done'
    ? visits.map((visit) => {
        const vendor = vendorFor(org, category, rand)
        const completed = visit + 17 * HOUR <= windowEnd
        const hours = int(rand, 1, 12) / 2
        return {
          vendorId: vendor.id,
          scheduledFor: visit,
          completedOn: completed ? visit : null,
          hours: completed ? hours : null,
          costCents: completed ? Math.round(hours * vendor.rate * 100) + int(rand, 0, 40) * 1000 : null,
          notes: completed && visits.length > 1 && visit === visits[0] ? 'Temporary fix, part ordered' : null,
          createdAt: plannedAt,
        }
      })
    : []
  const closedAt = status === 'done' ? visits.at(-1)! + int(rand, 14, 17) * HOUR : status === 'cancelled' ? cancelledAt : null
  const title = pick(rand, categories[category].titles)
  return {
    id: org.ticketFirstId + ordinal,
    number: `MT-${new Date(reportedAt).getUTCFullYear()}-${String(ordinal + 1).padStart(6, '0')}`,
    propertyId: org.propertyFirstId + property,
    unitId: wholeProperty ? null : org.unitFirstId + unit,
    reportedBy: wholeProperty ? null : reportedBy,
    assignedTo: status === 'reported' && rand() < 0.5 ? null : pick(rand, org.maintenanceUsers).id,
    category,
    priority,
    status,
    title,
    description: rand() < 0.6 ? `${title}. ${pick(rand, ['Tenant is home after 17:00.', 'Key is with the neighbours.', 'Please call before coming.', 'Started last week.', 'Second time this year.'])}` : null,
    reportedAt,
    closedAt,
    workOrders,
    updatedAt: closedAt ?? (workOrders.length > 0 ? plannedAt : reportedAt),
  }
}
