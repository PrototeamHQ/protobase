import { createUser, deleteUser, hasUsers, listUsers, roleChoices, setUserBanned, setUserRole, type AdminAuth } from '@protobase/server'
import type { UsersApi } from './commands'

// The commands over a project's Better Auth instance.
export const usersApi = (auth: AdminAuth): UsersApi => ({
  hasUsers: () => hasUsers(auth),
  roles: async () => ({ roles: roleChoices(auth), defaultRole: auth.defaultRole }),
  createUser: (input) => createUser(auth, input),
  listUsers: () => listUsers(auth),
  deleteUser: (email) => deleteUser(auth, email),
  setUserRole: (input) => setUserRole(auth, input),
  setUserBanned: (input) => setUserBanned(auth, input),
})
