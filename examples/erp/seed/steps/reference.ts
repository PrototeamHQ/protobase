import type { Db } from '../../db/connection'
import { DAY, windowStart } from '../calendar'
import { copyRows } from '../copy'
import { countries, currencies } from '../data/reference'
import { iso, row } from '../format'
import type { World } from '../world'
import { seedAuthOrganizations } from '../auth-organizations'

export const seedReference = async (sql: Db, world: World) => {
  const createdAt = iso(windowStart - 5 * 365 * DAY)
  await copyRows(sql, 'core.countries (code, name, eu_member)', countries.map((country) => row(...country)))
  await copyRows(sql, 'core.currencies (code, name, symbol, decimals)', currencies.map((currency) => row(...currency)))
  await copyRows(
    sql,
    'core.organizations (id, name, slug, country_code, currency_code, created_at, updated_at)',
    world.orgs.map((org) => row(org.id, org.name, org.slug, org.country, 'EUR', createdAt, createdAt)),
  )
  await seedAuthOrganizations(sql, world.orgs)
  await copyRows(
    sql,
    'core.users (id, organization_id, email, name, role, active, created_at, updated_at)',
    world.orgs.flatMap((org) => org.users.map((user) => row(user.id, org.id, user.email, user.name, user.role, true, createdAt, createdAt))),
  )
}
