/** A table as the catalogue names it. */
export type FoundTable = { schema: string; name: string }

/** A privilege of the query role: usage on a schema, or select on a table. */
export type QueryGrant = { on: 'schema'; schema: string } | ({ on: 'table' } & FoundTable)

export type QueryGrants = { grants: QueryGrant[]; revokes: QueryGrant[] }

const same = (a: FoundTable, b: FoundTable) => a.schema === b.schema && a.name === b.name

const unique = <T>(items: T[], equal: (a: T, b: T) => boolean) => items.filter((item, index) => items.findIndex((other) => equal(item, other)) === index)

/**
 * What the query role must be given and what taken back so that it reads exactly the resources' tables, never an auth
 * table, with usage on the schemas those are in. `resources` and `authTables` are the tables that exist, `granted`
 * what the role holds now.
 */
export const plannedGrants = ({ resources, authTables, granted }: { resources: FoundTable[]; authTables: FoundTable[]; granted: { tables: FoundTable[]; schemas: string[] } }): QueryGrants => {
  const tables = unique(
    resources.filter((table) => !authTables.some((auth) => same(table, auth))),
    same,
  )
  const schemas = [...new Set(tables.map((table) => table.schema))]
  return {
    grants: [
      ...schemas.filter((schema) => !granted.schemas.includes(schema)).map((schema): QueryGrant => ({ on: 'schema', schema })),
      ...tables.filter((table) => !granted.tables.some((found) => same(found, table))).map((table): QueryGrant => ({ on: 'table', ...table })),
    ],
    revokes: [
      ...granted.tables.filter((found) => !tables.some((table) => same(table, found))).map((table): QueryGrant => ({ on: 'table', ...table })),
      ...granted.schemas.filter((schema) => !schemas.includes(schema)).map((schema): QueryGrant => ({ on: 'schema', schema })),
    ],
  }
}
