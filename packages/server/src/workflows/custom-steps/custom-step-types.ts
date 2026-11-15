import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { customStepEntry, type CustomStepVersion, type TypeEntry } from '@protobase/workflows'

/** A tenant's custom step types, read in `db`, such as a write's transaction: `(db, tenant)`. */
export type CustomStepTypes = (db: Db, tenant: unknown) => Promise<TypeEntry[]>

/**
 * Every saved version of a tenant's custom steps as a step type, `custom:<name>:<version>`, by name and version. They
 * are the tenant's whatever the reader may read of the custom steps themselves: their grants govern authoring only.
 */
export const customStepTypes = (schema: string): CustomStepTypes => async (db, tenant) => {
  const value = tenant === undefined || tenant === null ? null : String(tenant)
  const { rows } = await sql<CustomStepVersion>`select v.name, v.version, v.label, v.description, v.input, v.output, v.error_prefix, v.errors
    from ${sql.id(schema, 'custom_step_versions')} v where ${value === null ? sql`v.tenant_id is null` : sql`v.tenant_id = ${value}`} order by v.name, v.version`.execute(db)
  return rows.map(customStepEntry)
}
