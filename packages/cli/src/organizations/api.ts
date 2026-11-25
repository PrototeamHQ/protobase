import { addAppRoleToOwners, addEveryUser, addMember, createOrganization, listOrganizations, removeMember, setMemberRoles, type AdminAuth } from '@protobase/server'
import type { OrganizationsApi } from './commands'
import { pinSource } from './pin-source'

// The commands over a project's Better Auth instance.
export const organizationsApi = (auth: AdminAuth): OrganizationsApi => ({
  ...pinSource(auth),
  listOrganizations: (scope, after) => listOrganizations(auth, scope, after && { after }),
  createOrganization: (input) => createOrganization(auth, input),
  addMember: (input) => addMember(auth, input),
  setMemberRoles: (input) => setMemberRoles(auth, input),
  removeMember: (input) => removeMember(auth, input),
  addAppRoleToOwners: (scope, appRole) => addAppRoleToOwners(auth, scope, appRole),
  addEveryUser: (organization) => addEveryUser(auth, organization),
})
