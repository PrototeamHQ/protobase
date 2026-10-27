import type { KeyType } from '@protobase/schema'
import type { AdminAuth } from './better-auth/create-auth'
import type { Registry } from './registry'

// A text column holds any id, and a bigint column any integer one.
const holds = (field: KeyType, id: KeyType) => field === 'text' || field === id || (field === 'bigint' && id === 'integer')

/**
 * Stops startup on an `.owner()` or `.author()` field that cannot hold the ids of the signed-in users. The authenticator's
 * `userIdType` declares their type; without it, the auth instance's users have Better Auth's own ids, random text,
 * unless `generateUserId` makes the ids. Without either, the ids come from the app's own authenticator, which this
 * cannot see.
 */
export const checkOwnerFields = (registry: Registry, userIdType: KeyType | undefined, auth: Pick<AdminAuth, 'generatesUserIds'> | undefined) => {
  if (userIdType) return checkAgainst(registry, userIdType, (ownerType) => `the authenticator's users have ${userIdType} ids: make it a ${userIdType} or text column, or declare the authenticator's userIdType`)
  if (!auth || auth.generatesUserIds) return
  checkAgainst(registry, 'text', (ownerType) => `Better Auth's user ids are random text: make it a text column, or give createAuth a generateUserId that makes ${ownerType} ids`)
}

const checkAgainst = (registry: Registry, userIdType: KeyType, fix: (ownerType: KeyType) => string) => {
  for (const entry of registry.entries) {
    const fields = [
      { role: 'owner', name: entry.model.owner, type: entry.ownerType },
      { role: 'author', name: entry.model.author, type: entry.authorType },
    ]
    for (const { role, name, type } of fields) {
      if (type === undefined || holds(type, userIdType)) continue
      throw new Error(`${entry.name}.${name} is the ${role} of its records, so it holds the signed-in user's id, but it holds ${type} values and ${fix(type)}`)
    }
  }
}
