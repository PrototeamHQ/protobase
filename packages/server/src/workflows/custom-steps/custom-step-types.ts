import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { customStepEntry, type CustomStepVersion, type TypeEntry } from '@protobase/workflows'

/** A tenant's custom step types, read in `db`, such as a write's transaction: `(db, tenant)`. */
export type CustomStepTypes = (db: Db, tenant: unknown) => Promise<TypeEntry[]>

/**
 * Every saved version of a tenant's custom steps as a step type, `custom:<name>:<version>`, by name and version, with
 * how its image's builds on the tenant's runners stand; a deleted step's versions are kept, but are no step types. They
 * are the tenant's whatever the reader may read of the custom steps themselves: their grants govern authoring only.
 */
export const customStepTypes = (schema: string): CustomStepTypes => async (db, tenant) => {
  const value = tenant === undefined || tenant === null ? null : String(tenant)
  const { rows } = await sql<CustomStepVersion>`select v.name, v.version, v.label, v.description, v.input, v.output, v.error_prefix, v.errors,
      (select case when bool_or(b.status = 'ready') then 'ready' when bool_or(b.status = 'building') then 'building' else 'failed' end
        from ${sql.id(schema, 'custom_step_builds')} b where b.version_id = v.id) as build
    from ${sql.id(schema, 'custom_step_versions')} v where v.custom_step_id is not null and ${value === null ? sql`v.tenant_id is null` : sql`v.tenant_id = ${value}`} order by v.name, v.version`.execute(db)
  return rows.map(customStepEntry)
}
