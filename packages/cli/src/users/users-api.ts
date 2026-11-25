import { addMember, createUser, deleteUser, hasUsers, listUsers, roleChoices, setUserBanned, setUserRole, type AdminAuth } from '@protobase/server'
import { pinSource } from '../organizations/pin-source'
import type { UsersApi } from './commands'

// The commands over a project's Better Auth instance.
export const usersApi = (auth: AdminAuth): UsersApi => ({
  ...pinSource(auth),
  hasUsers: () => hasUsers(auth),
  roles: async () => ({ roles: roleChoices(auth), defaultRole: auth.defaultRole, labels: auth.roleDefinitions.labels }),
  createUser: (input) => createUser(auth, input),
  listUsers: (scope, after) => listUsers(auth, { ...(after && { after }), ...(scope !== undefined && { scope }) }),
  deleteUser: (email) => deleteUser(auth, email),
  setUserRole: (input) => setUserRole(auth, input),
  setUserBanned: (input) => setUserBanned(auth, input),
  addMember: (input) => addMember(auth, input),
})
