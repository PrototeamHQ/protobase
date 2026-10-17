import type { AdminAuth } from './better-auth/create-auth'
import type { Registry } from './registry'

/**
 * Stops startup on an `.owner()` field that cannot hold the ids of the auth instance's users: Better Auth's own ids
 * are random text, so the field must be text unless `generateUserId` makes the ids. Without an auth instance the
 * ids come from the app's own authenticator, which this cannot see.
 */
export const checkOwnerFields = (registry: Registry, auth: Pick<AdminAuth, 'generatesUserIds'> | undefined) => {
  if (!auth || auth.generatesUserIds) return
  for (const entry of registry.entries) {
    if (entry.ownerType === undefined || entry.ownerType === 'text') continue
    throw new Error(
      `${entry.name}.${entry.model.owner} is the owner of its records, so it holds the signed-in user's id, but it holds ${entry.ownerType} values and Better Auth's user ids are random text: make it a text column, or give createAuth a generateUserId that makes ${entry.ownerType} ids`,
    )
  }
}
