import { isMemberByEmail, organizationByKey, type AdminAuth } from '@protobase/server'
import type { PinSource } from './pin'

// Where the commands read their pin: the config's `auth.organizations.default` and the project's store.
export const pinSource = (auth: AdminAuth): PinSource => {
  const pinned = auth.organizations?.options.default
  return {
    organizationsOn: auth.organizations !== undefined,
    ...(pinned && { defaultOrganization: pinned }),
    organizationByKey: async (key) => {
      const found = await organizationByKey(auth, key)
      return found && { id: found.id, slug: found.slug, name: found.name }
    },
    isMember: (organizationId, email) => isMemberByEmail(auth, organizationId, email),
  }
}
