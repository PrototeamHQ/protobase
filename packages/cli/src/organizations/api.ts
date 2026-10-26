import { addAppRoleToOwners, addMember, createOrganization, listOrganizations, listUsers, removeMember, setMemberRoles, setUserRole, type AdminAuth } from '@protobase/server'
import type { OrganizationsApi } from './commands'

// The commands over a project's Better Auth instance.
export const organizationsApi = (auth: AdminAuth): OrganizationsApi => ({
  listOrganizations: () => listOrganizations(auth),
  createOrganization: (input) => createOrganization(auth, input),
  addMember: (input) => addMember(auth, input),
  setMemberRoles: (input) => setMemberRoles(auth, input),
  removeMember: (input) => removeMember(auth, input),
  addAppRoleToOwners: (appRole) => addAppRoleToOwners(auth, appRole),
  listUsers: () => listUsers(auth),
  setUserRole: (input) => setUserRole(auth, input),
  membershipRoles: () => auth.roleDefinitions.names.filter((name) => name !== 'admin' && name !== 'user'),
})
