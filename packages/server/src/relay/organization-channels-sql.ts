import { sql } from 'kysely'
import { quoteIdent, tableSql } from '../changes/capture-sql'
import type { ListedModel } from './relay-models'

type Row = { resource: string; channel: string; organization: string }

const column = (listed: ListedModel, field: string) => sql.raw(quoteIdent(listed.model.fields[field]!.column))

// A record whose members field is null, and not soft-deleted, reaches its organization.
const open = (listed: ListedModel) => {
  const deleted = listed.model.softDelete
  return deleted === undefined ? sql`${column(listed, listed.field)} is null` : sql`${column(listed, listed.field)} is null and ${column(listed, deleted)} is null`
}

const select = (resource: string, listed: ListedModel) =>
  sql`select ${resource}::text as resource, ${column(listed, listed.model.primaryKey[0]!)}::text as channel, ${column(listed, listed.tenant!)}::text as organization from ${sql.raw(tableSql(listed.model))}`

/** The channels of these resources' records in these organizations that reach the whole organization, by the tenant column's index. */
export const organizationChannels = (resources: ReadonlyArray<[string, ListedModel]>, organizations: readonly string[]) =>
  sql<Row>`${sql.join(
    resources.map(([resource, listed]) => sql`${select(resource, listed)} where ${column(listed, listed.tenant!)} = any(${organizations}) and ${open(listed)}`),
    sql` union all `,
  )}`

/** Of the named records of each resource, by key, those that reach their whole organization, with it. */
export const organizationWide = (named: ReadonlyArray<{ resource: string; listed: ListedModel; keys: string[] }>) =>
  sql<Row>`${sql.join(
    named.map(({ resource, listed, keys }) => sql`${select(resource, listed)} where ${column(listed, listed.model.primaryKey[0]!)} = any(${keys}) and ${open(listed)}`),
    sql` union all `,
  )}`

/** Of these organizations, those with a record of these resources that reaches the whole organization. */
export const organizationsReached = (resources: ReadonlyArray<[string, ListedModel]>, organizations: readonly string[]) =>
  sql<{ organization: string }>`select distinct organization from (${organizationChannels(resources, organizations)}) as reached`
