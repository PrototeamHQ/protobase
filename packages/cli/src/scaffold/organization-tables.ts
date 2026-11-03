import { definitionsSchema, userTablesSchema } from '@protobase/server/config-exports'
import type { Sql } from '../db/connect'

/**
 * The tables users add that belong to an organization, as `schema.table` with the organization's id, from their
 * definitions: none when the database keeps no definitions, or none made with organizations.
 */
export const readOrganizationTables = async (sql: Sql): Promise<Map<string, string>> => {
  const [found] = await sql<{ organizations: boolean }[]>`select exists (select from information_schema.columns
    where table_schema = ${definitionsSchema} and table_name = 'tables' and column_name = 'organization_id') as organizations`
  if (!found?.organizations) return new Map()
  const rows = await sql<{ table_name: string; organization_id: string }[]>`select table_name, organization_id
    from ${sql(definitionsSchema)}.tables where organization_id is not null`
  return new Map(rows.map((row) => [`${userTablesSchema}.${row.table_name}`, row.organization_id]))
}

/**
 * What scaffold says when it takes over an organization's table: whose definition it took, that the records keep their
 * organization, and that the access rule the server gave the table does not come along.
 */
export const takenOverLine = (table: string, organizationId: string) =>
  `${table}: taken over from the definition of organization ${organizationId}; its records keep their organization through .tenant((r) => r.organization_id). ` +
  `Served from its definition, only that organization's owners and admins reached it; the resource in code follows the project's access rules instead, so add .access(...) to keep it to them`
