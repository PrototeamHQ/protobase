import { addAppRoleToOwners, addEveryUser, addMember, createOrganization, listOrganizations, removeMember, setMemberRoles, type AdminAuth } from '@protobase/server'
import type { OrganizationsApi } from './commands'

// The commands over a project's Better Auth instance.
export const organizationsApi = (auth: AdminAuth): OrganizationsApi => ({
  listOrganizations: (after) => listOrganizations(auth, after && { after }),
  createOrganization: (input) => createOrganization(auth, input),
  addMember: (input) => addMember(auth, input),
  setMemberRoles: (input) => setMemberRoles(auth, input),
  removeMember: (input) => removeMember(auth, input),
  addAppRoleToOwners: (appRole) => addAppRoleToOwners(auth, appRole),
  addEveryUser: (organization) => addEveryUser(auth, organization),
})
