import type { TenantValue, Session, User } from '../types'

/** Whether a field holds nothing the model could read: `null`, missing or blank text. */
export const isEmpty = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

/** Whether two values of a record are the same, json and file values by their content. */
export const same = (a: unknown, b: unknown) => a === b || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b))

/** The session of a writer as a write hook saw them, in their tenant: what an AI field is filled as. */
export const writerSession = (user: User, tenant: TenantValue | undefined): Session => ({ user, ...(tenant !== undefined && { tenant, organization: { id: tenant } }) })
