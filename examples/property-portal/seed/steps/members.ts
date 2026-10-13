import { hashPassword } from 'better-auth/crypto'
import type { Db } from '../../db/connection'
import { demoPassword } from '../builders/member'
import { copyRows } from '../copy'
import { iso, row } from '../format'
import type { World } from '../world'

function* userRows(world: World) {
  for (const user of world.users) yield row(user.id, user.name, user.email, true, iso(user.createdAt), iso(user.createdAt), user.role, false, false)
}

// Only the demo accounts can sign in: they get a password, the generated members none.
const accountRows = async (world: World) => {
  const password = await hashPassword(demoPassword)
  return world.users.filter((user) => user.demo).map((user) => row(`${user.id}-credential`, user.id, 'credential', user.id, password, iso(user.createdAt), iso(user.createdAt)))
}

function* searchRows(world: World) {
  for (const s of world.searches) yield row(s.id, s.userId, s.name, s.filter, s.alertFrequency, iso(s.seenAt), iso(s.createdAt))
}

function* alertRows(world: World) {
  for (const alert of world.alerts) yield row(alert.search.userId, alert.search.id, alert.listing.id, iso(alert.matchedAt), alert.emailedAt === null ? null : iso(alert.emailedAt))
}

function* favoriteRows(world: World) {
  for (const { user, favorites } of world.saved) for (const favorite of favorites) yield row(user.id, favorite.listing.id, iso(favorite.createdAt))
}

function* noteRows(world: World) {
  for (const { user, notes } of world.saved) for (const note of notes) yield row(user.id, note.listing.id, note.body, iso(note.createdAt), iso(note.createdAt))
}

export const seedMembers = async (sql: Db, world: World) => {
  await copyRows(sql, 'auth."user" (id, name, email, email_verified, created_at, updated_at, role, banned, two_factor_enabled)', userRows(world))
  await copyRows(sql, 'auth.account (id, account_id, provider_id, user_id, password, created_at, updated_at)', await accountRows(world))
  await copyRows(sql, 'members.saved_searches (id, user_id, name, filter, alert_frequency, seen_at, created_at)', searchRows(world))
  await copyRows(sql, 'members.alerts (user_id, saved_search_id, listing_id, matched_at, emailed_at)', alertRows(world))
  await copyRows(sql, 'members.favorites (user_id, listing_id, created_at)', favoriteRows(world))
  await copyRows(sql, 'members.notes (user_id, listing_id, body, created_at, updated_at)', noteRows(world))
}
