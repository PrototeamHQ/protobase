import { badRequest } from '../problem'
import { presenceStatuses, type PresenceStatus } from './presence-model'

/** One person's new status, and when it began, in milliseconds. */
export type PresenceChange = { user: string; status: PresenceStatus; at: number }

/** A presence report of the relay: when it started, in milliseconds, and the changes. */
export type PresenceReport = { started: number; changes: PresenceChange[] }

/** The most changes one report holds, as the relay batches them. */
export const maxPresenceChanges = 500

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// The latest time a date holds, in milliseconds; a later one has no timestamp to be written as.
const maxTime = 8.64e15

const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maxTime

const presenceChange = (value: unknown): PresenceChange => {
  if (!isRecord(value)) throw badRequest('invalid-change', 'A change is { user, status, at }')
  const { user, status, at } = value
  if (typeof user !== 'string' || user === '') throw badRequest('invalid-user', "A change's user is a user id")
  if (!presenceStatuses.includes(status as PresenceStatus)) throw badRequest('invalid-status', `A change's status is one of ${presenceStatuses.join(', ')}`)
  if (!isTime(at)) throw badRequest('invalid-at', "A change's at is a time in milliseconds")
  return { user, status: status as PresenceStatus, at }
}

/** The report a body holds, as the relay sends it, or a `400` naming what is wrong. */
export const presenceReport = (body: unknown): PresenceReport => {
  if (!isRecord(body)) throw badRequest('invalid-body', 'The body is { started, changes: [{ user, status, at }] }')
  if (!isTime(body.started)) throw badRequest('invalid-started', 'started is a time in milliseconds')
  if (!Array.isArray(body.changes)) throw badRequest('invalid-changes', 'changes is a list of { user, status, at }')
  if (body.changes.length > maxPresenceChanges) throw badRequest('too-many-changes', `A report holds at most ${maxPresenceChanges} changes`)
  return { started: body.started, changes: body.changes.map(presenceChange) }
}
