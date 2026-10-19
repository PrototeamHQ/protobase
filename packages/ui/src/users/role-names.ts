import type { RoleLabel } from '@protobase/client'
import { roleLabel } from '../organizations/organization-paths'

/** The labels of `names`, as the server names the roles, in one line. */
export const roleNames = (roles: readonly RoleLabel[], names: readonly string[]) => names.map((name) => roleLabel(roles, name)).join(', ')
