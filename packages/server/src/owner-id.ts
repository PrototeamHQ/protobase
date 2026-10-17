import { fitsKeyType, type CheckedFilter, type ResolvedAccess } from '@protobase/schema'
import { HttpProblem } from './problem'
import type { Entry } from './registry'
import type { User } from './types'

const mentions = (filter: CheckedFilter, name: string): boolean => {
  if (filter.kind === 'and' || filter.kind === 'or') return filter.args.some((arg) => mentions(arg, name))
  if (filter.kind === 'not') return mentions(filter.arg, name)
  return 'field' in filter && filter.field.name === name
}

/**
 * Refuses a request whose row filters compare the `.owner()` field with a user id it cannot hold, such as Better
 * Auth's random text in an integer column, naming the field, instead of failing as a value of the wrong format.
 */
export const checkOwnerId = (entry: Entry, user: User, resolved: ResolvedAccess) => {
  const { ownerType, model } = entry
  if (ownerType === undefined || model.owner === undefined || fitsKeyType(String(user.id), ownerType)) return
  const owner = model.owner
  if (!Object.values(resolved.rowFilter).some((filter) => filter && mentions(filter, owner))) return
  throw new HttpProblem(
    500,
    'owner-id-mismatch',
    'Internal Server Error',
    `${entry.name}.${owner} holds ${ownerType} user ids, and the signed-in user's id "${user.id}" is not one, so their own records cannot be found`,
  )
}
