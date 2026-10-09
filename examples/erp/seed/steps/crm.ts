import type { Db } from '../../db/connection'
import { companyAt, peopleOf, personAt } from '../builders/company'
import { DAY, windowEnd, within } from '../calendar'
import { copyRows } from '../copy'
import { tagNames } from '../data/reference'
import { iso, row } from '../format'
import { int, rngAt, weighted } from '../rng'
import type { World } from '../world'

function* companyRows(world: World) {
  for (const org of world.orgs) {
    for (let ordinal = 0; ordinal < org.companyCount; ordinal++) {
      const company = companyAt(org, ordinal)
      const createdAt = iso(company.createdAt)
      yield row(company.id, org.id, company.name, company.country, company.city, company.vatNumber, company.email, company.phone, company.status, createdAt, createdAt)
    }
  }
}

function* personRows(world: World) {
  for (const org of world.orgs) {
    for (let ordinal = 0; ordinal < org.companyCount; ordinal++) {
      const company = companyAt(org, ordinal)
      for (let slot = 0; slot < peopleOf(org, ordinal); slot++) {
        const person = personAt(org, company, ordinal, slot)
        const createdAt = iso(person.createdAt)
        yield row(person.id, org.id, company.id, person.first, person.last, person.email, person.phone, person.title, createdAt, createdAt)
      }
    }
  }
}

function* tagRows(world: World) {
  const createdAt = iso(windowEnd - 3 * 365 * DAY)
  for (const org of world.orgs) {
    for (const [index, [name, color]] of tagNames.entries()) yield row(org.tagFirstId + index, org.id, name, color, createdAt, createdAt)
  }
}

function* companyTagRows(world: World) {
  for (const org of world.orgs) {
    const staff = org.users.filter((user) => user.role === 'sales' || user.role === 'admin')
    for (let ordinal = 0; ordinal < org.companyCount; ordinal++) {
      const rand = rngAt(org.seed + 6, ordinal)
      const count = weighted(rand, [[0, 55], [1, 25], [2, 15], [3, 5]] as const)
      const company = companyAt(org, ordinal)
      const chosen = new Set<number>()
      while (chosen.size < count) chosen.add(int(rand, 0, tagNames.length - 1))
      for (const tag of chosen) {
        const addedAt = within(company.createdAt, int(rand, 1, 400) * DAY + Math.floor(rand() * DAY), rand)
        yield row(company.id, org.tagFirstId + tag, org.id, staff[int(rand, 0, staff.length - 1)]!.id, iso(addedAt))
      }
    }
  }
}

export const seedCrm = async (sql: Db, world: World) => {
  await copyRows(sql, 'crm.companies (id, organization_id, name, country_code, city, vat_number, email, phone, status, created_at, updated_at)', companyRows(world))
  await copyRows(sql, 'crm.people (id, organization_id, company_id, first_name, last_name, email, phone, job_title, created_at, updated_at)', personRows(world))
  await copyRows(sql, 'crm.tags (id, organization_id, name, color, created_at, updated_at)', tagRows(world))
  await copyRows(sql, 'crm.company_tags (company_id, tag_id, organization_id, added_by, added_at)', companyTagRows(world))
}
