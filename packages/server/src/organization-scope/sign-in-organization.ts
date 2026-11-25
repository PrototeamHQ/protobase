import { AsyncLocalStorage } from 'node:async_hooks'
import { everyOrganization, type EveryOrganization, type Organization, type OrganizationSource } from '@protobase/query'

// The organization sign-in's queries work in, set around a piece of work and inherited by every promise it starts,
// Better Auth's background tasks too.
const current = new AsyncLocalStorage<Organization | EveryOrganization>()

/**
 * Where sign-in's database (`appAuthOptions`) finds the organization each query works in: the one the work around it
 * set with `inOrganization`, every one within `acrossOrganizations`, and none outside both, which sees no row of the
 * organization's tables and writes none.
 */
export const signInOrganization: OrganizationSource = () => current.getStore()

/** Runs `work` with sign-in's queries kept to `scope`: an organization, none, or every one (`everyOrganization`). */
export const inSignInScope = <Result>(scope: Organization | EveryOrganization, work: () => Result) => current.run(scope, work)

/** Runs `work` with sign-in's queries kept to `organization`; undefined keeps them to none. */
export const inOrganization = <Result>(organization: Organization, work: () => Result) => current.run(organization, work)

/**
 * Runs `work` with sign-in's queries reading every organization's rows: `reason` says why the work crosses
 * organizations, such as "a user lists their own memberships". Refused without one.
 */
export const acrossOrganizations = <Result>(reason: string, work: () => Result) => current.run(everyOrganization(reason), work)
