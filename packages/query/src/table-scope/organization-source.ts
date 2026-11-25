import type { Organization } from './scope-condition'

/** Every organization's rows, on purpose: `unscoped` says why, for whoever reviews it. */
export type EveryOrganization = { readonly unscoped: string }

/**
 * Where the scope finds the organization a query works in, read as each query is built, such as from the request it
 * runs for: an organization, none, or every organization (`EveryOrganization`).
 */
export type OrganizationSource = () => Organization | EveryOrganization

/** The scope's organization: a fixed one, or one an `OrganizationSource` gives at the time. */
export type ScopeOrganization = Organization | OrganizationSource

/** The organization a query works in now. */
export const currentOrganization = (organization: ScopeOrganization) => (typeof organization === 'function' ? organization() : organization)

/** Whether a query works in every organization. */
export const isEveryOrganization = (organization: Organization | EveryOrganization): organization is EveryOrganization => typeof organization === 'object' && organization !== null

/** Every organization's rows, saying why; refused without a reason. */
export const everyOrganization = (reason: string): EveryOrganization => {
  if (typeof reason !== 'string' || reason.trim() === '') throw new Error('every organization needs a reason: say why this work reads every organization')
  return { unscoped: reason }
}
