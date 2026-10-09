import { categories } from './builders/categories'
import { timestamps } from './calendar'
import { locationsPerWarehouse } from './data/layout'
import { orgSpecs, tagNames } from './data/reference'
import { rngAt, weighted } from './rng'
import { scales, type ScaleName } from './scales'

export const employeesPerOrg = 40

// Splits a scale total over the organizations by share; the last one takes the remainder.
const splitTotal = (total: number) => {
  const parts: number[] = []
  for (const [index, spec] of orgSpecs.entries()) {
    parts.push(index === orgSpecs.length - 1 ? total - parts.reduce((sum, part) => sum + part, 0) : Math.round(total * spec.share))
  }
  return parts
}

// Every table's ids are allocated here, so builders can compute foreign keys without lookups.
export const buildWorld = (name: ScaleName) => {
  const scale = scales[name]
  const companies = splitTotal(scale.companies)
  const orders = splitTotal(scale.orders)
  const moves = splitTotal(scale.moves)
  const next = { user: 1, company: 1, person: 1, tag: 1, category: 1, product: 1, order: 0, warehouse: 1, location: 1, move: 1, employee: 1 }

  const orgs = orgSpecs.map((spec, index) => {
    const companyCount = companies[index]!
    const personStarts = new Uint32Array(companyCount + 1)
    for (let ordinal = 0; ordinal < companyCount; ordinal++) {
      personStarts[ordinal + 1] = personStarts[ordinal]! + weighted(rngAt(spec.seed + 3, ordinal), [[1, 30], [2, 40], [3, 30]] as const)
    }
    const users = spec.users.map(([first, initial, role], position) => ({
      id: next.user + position,
      name: `${first} ${initial}`,
      email: `${first.toLowerCase()}@${spec.slug}.example`,
      role,
    }))
    const warehouses = spec.warehouses.map(([code, warehouseName, city, country], position) => ({
      id: next.warehouse + position,
      code,
      name: warehouseName,
      city,
      country,
      firstLocationId: next.location + position * locationsPerWarehouse,
    }))
    const org = {
      ...spec,
      users,
      salesUsers: users.filter((user) => user.role === 'sales'),
      warehouseUsers: users.filter((user) => user.role === 'warehouse'),
      warehouses,
      companyCount,
      companyFirstId: next.company,
      personStarts,
      personFirstId: next.person,
      tagFirstId: next.tag,
      categoryFirstId: next.category,
      productCount: scale.productsPerOrg,
      productFirstId: next.product,
      orderCount: orders[index]!,
      orderFirstId: next.order,
      orderTimes: timestamps(orders[index]!, spec.seed + 5),
      moveCount: moves[index]!,
      moveFirstId: next.move,
      employeeFirstId: next.employee,
    }
    next.user += users.length
    next.company += companyCount
    next.person += personStarts[companyCount]!
    next.tag += tagNames.length
    next.category += categories.length
    next.product += scale.productsPerOrg
    next.order += org.orderCount
    next.warehouse += warehouses.length
    next.location += warehouses.length * locationsPerWarehouse
    next.move += org.moveCount
    next.employee += employeesPerOrg
    return org
  })

  return { name, orgs }
}

export type World = ReturnType<typeof buildWorld>
export type Org = World['orgs'][number]
