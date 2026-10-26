import type { Db } from '../../db/connection'
import { DAY, windowStart } from '../calendar'
import { copyRows } from '../copy'
import { amenities } from '../data/reference'
import { iso, row } from '../format'
import type { World } from '../world'

export const seedReference = async (sql: Db, world: World) => {
  const createdAt = iso(windowStart - 10 * 365 * DAY)
  await copyRows(sql, 'portfolio.amenities (code, name)', amenities.map((amenity) => row(...amenity)))
  await copyRows(
    sql,
    'core.organizations (id, name, slug, city, kvk_number, created_at, updated_at)',
    world.orgs.map((org) => row(org.id, org.name, org.slug, org.city, org.kvk, createdAt, createdAt)),
  )
  await copyRows(
    sql,
    'core.users (id, organization_id, email, name, role, active, created_at, updated_at)',
    world.orgs.flatMap((org) => org.users.map((user) => row(user.id, org.id, user.email, user.name, user.role, true, createdAt, createdAt))),
  )
}
